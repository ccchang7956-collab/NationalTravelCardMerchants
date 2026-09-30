#!/usr/bin/env python3
"""
國旅卡特約商店清冊自動更新腳本
由 supercronic 排程每天凌晨 3:00（台灣時間）執行。

流程：
  1. 從政府開放資料下載最新 PDF（ZIP 格式）
  2. 計算 SHA256 hash，若與上次相同則跳過
  3. 解析 PDF → 寫入暫存 DB
  4. 從舊 DB 遷移已有的 lat/lon 座標（以 tax_id 為 key）
  5. 用郵遞區號 fallback 填補新商家座標
  6. 原子性替換 merchants.db
  7. 寫入 metadata 與 hash 記錄
  8. 清理暫存檔案

環境變數：
  DB_PATH    資料庫路徑（預設 /data/merchants.db）
"""

import os
import sys
import hashlib
import shutil
import sqlite3
import logging
import tempfile
import zipfile
import re
import math
import random
import unicodedata
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Tuple

import requests
import fitz  # PyMuPDF

# ── 設定 ────────────────────────────────────────────────────────────────────
DOWNLOAD_URL = "https://travel.nccc.com.tw/NASApp/NTC/html/RetailerFileDownload.jsp"
DB_PATH      = os.environ.get("DB_PATH", "/data/merchants.db")
DATA_DIR     = str(Path(DB_PATH).parent)
HASH_FILE    = os.path.join(DATA_DIR, "pdf_hash.txt")
META_FILE    = os.path.join(DATA_DIR, "update_meta.json")

# 大量刪除安全閘門（可用環境變數覆寫）
MASS_MIN_OLD = int(os.environ.get("MASS_DELETE_MIN_OLD", "100"))
MASS_RATIO = float(os.environ.get("MASS_DELETE_RATIO", "0.5"))

# 下載大小上限（MB）：超過即中止並刪除暫存檔，避免磁碟爆掉
MAX_DOWNLOAD_MB = 200

TZ_TAIPEI = timezone(timedelta(hours=8))

# ── 日誌設定 ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)

# ── 失敗通知鉤子 ──────────────────────────────────────────────────────────────
# 設定 NOTIFY_WEBHOOK_URL（如 Slack Incoming Webhook）後，更新中止時會 POST 通知；
# 未設定則僅寫 log，不影響流程。
NOTIFY_URL = os.environ.get("NOTIFY_WEBHOOK_URL", "")

def notify(msg: str) -> None:
    if NOTIFY_URL:
        try:
            requests.post(NOTIFY_URL, json={"text": msg}, timeout=10)
        except Exception as e:
            log.warning(f"notify failed: {e}")

# ── 台灣郵遞區號 → (lat, lon, radius_km) ───────────────────────────────────
TAIWAN_ZIPCODES: dict[str, tuple[float, float, float]] = {
    "100": (25.0413, 121.5226, 1.2), "103": (25.0628, 121.5098, 1.0),
    "104": (25.0636, 121.5323, 1.5), "105": (25.0503, 121.5771, 1.2),
    "106": (25.0256, 121.5436, 1.5), "108": (25.0341, 121.4994, 1.2),
    "110": (25.0330, 121.5654, 1.5), "111": (25.0930, 121.5268, 3.0),
    "112": (25.1365, 121.4986, 4.0), "114": (25.0832, 121.5876, 2.5),
    "115": (25.0549, 121.6070, 2.0), "116": (24.9984, 121.5696, 3.0),
    "200": (25.1276, 121.7392, 1.0), "201": (25.1491, 121.7612, 1.2),
    "202": (25.1591, 121.7347, 1.5), "203": (25.1312, 121.7588, 1.2),
    "204": (25.1239, 121.7756, 1.5), "205": (25.0994, 121.7472, 1.5),
    "206": (25.0872, 121.7287, 1.5), "207": (25.2996, 121.5700, 2.0),
    "208": (25.2267, 121.6270, 2.0), "209": (25.1863, 121.6839, 2.0),
    "210": (26.1917, 120.0083, 3.0), "211": (26.1500, 120.0667, 3.0),
    "212": (26.0667, 119.9167, 2.0), "220": (25.0138, 121.4630, 2.5),
    "221": (25.0675, 121.6639, 2.5), "222": (25.0045, 121.6150, 2.0),
    "223": (24.9797, 121.6533, 3.0), "224": (25.1044, 121.8022, 2.0),
    "226": (25.0234, 121.7394, 3.0), "227": (25.0310, 121.8629, 3.0),
    "228": (25.0246, 121.9162, 3.0), "231": (24.9708, 121.5338, 3.0),
    "232": (24.9401, 121.7124, 4.0), "233": (24.8672, 121.5516, 5.0),
    "234": (25.0103, 121.5183, 1.2), "235": (24.9955, 121.4982, 1.5),
    "236": (24.9723, 121.4459, 2.0), "237": (24.9365, 121.3736, 3.0),
    "238": (24.9895, 121.4169, 2.0), "239": (24.9497, 121.3453, 1.5),
    "241": (25.0607, 121.4882, 1.5), "242": (25.0354, 121.4500, 2.0),
    "243": (25.0635, 121.4312, 1.5), "244": (25.0846, 121.3832, 2.5),
    "247": (25.0832, 121.4680, 1.2), "248": (25.0929, 121.4437, 1.5),
    "249": (25.1531, 121.4091, 2.0), "251": (25.1660, 121.4490, 3.0),
    "252": (25.2542, 121.5024, 2.0), "260": (24.7583, 121.7583, 2.0),
    "261": (24.8167, 121.7583, 3.0), "262": (24.7917, 121.8083, 3.0),
    "263": (24.7750, 121.7750, 2.5), "264": (24.7417, 121.7583, 3.0),
    "265": (24.6917, 121.7750, 2.5), "266": (24.7083, 121.8250, 4.0),
    "267": (24.6583, 121.8250, 6.0), "268": (24.6750, 121.7667, 2.5),
    "269": (24.6167, 121.8000, 3.0), "270": (24.5917, 121.8417, 4.0),
    "272": (24.4917, 121.8667, 8.0), "300": (24.8036, 120.9686, 2.0),
    "302": (24.8388, 121.0144, 2.0), "303": (24.8260, 121.0397, 2.5),
    "304": (24.7614, 120.9607, 2.0), "305": (24.7350, 120.9280, 2.5),
    "306": (24.7013, 120.9713, 3.0), "307": (24.7887, 121.1370, 3.0),
    "308": (24.8418, 121.0899, 3.0), "310": (24.6969, 121.0157, 2.5),
    "311": (24.6461, 121.0578, 5.0), "312": (24.6722, 121.1437, 4.0),
    "313": (24.6001, 121.1773, 6.0), "314": (24.8035, 121.1987, 3.0),
    "315": (24.7489, 121.2379, 3.0), "320": (24.9937, 121.3009, 2.5),
    "324": (24.9584, 121.2367, 2.0), "325": (24.9311, 121.2858, 3.0),
    "326": (24.9771, 121.2278, 3.0), "327": (24.8983, 121.2583, 3.0),
    "328": (24.8614, 121.3028, 3.0), "330": (24.9936, 121.3010, 2.5),
    "333": (25.0685, 121.3154, 2.5), "334": (25.0763, 121.2283, 2.0),
    "335": (24.9260, 121.3537, 3.5), "336": (24.9100, 121.4347, 8.0),
    "337": (25.0150, 121.2230, 3.0), "338": (25.0767, 121.1700, 2.5),
    "350": (24.5601, 120.8205, 2.0), "351": (24.6282, 120.8612, 2.5),
    "352": (24.6603, 120.8903, 3.0), "353": (24.7090, 120.9130, 5.0),
    "354": (24.7532, 120.9747, 5.0), "356": (24.5693, 120.7884, 2.5),
    "357": (24.5059, 120.7529, 3.0), "358": (24.4606, 120.6884, 3.0),
    "360": (24.5600, 120.8199, 2.0), "361": (24.5998, 120.7952, 2.5),
    "362": (24.6384, 120.8103, 2.5), "363": (24.5782, 120.7383, 3.0),
    "364": (24.5292, 120.7032, 4.0), "365": (24.5105, 120.7840, 5.0),
    "366": (24.4784, 120.7538, 3.0), "367": (24.4521, 120.8211, 3.0),
    "368": (24.4072, 120.7490, 3.0), "369": (24.4506, 120.6794, 2.5),
    "400": (24.1477, 120.6736, 0.8), "401": (24.1612, 120.6891, 1.5),
    "402": (24.1311, 120.6669, 1.5), "403": (24.1729, 120.6530, 1.5),
    "404": (24.1824, 120.6719, 1.5), "406": (24.2093, 120.7123, 2.0),
    "407": (24.2076, 120.6567, 2.5), "408": (24.1561, 120.6343, 2.0),
    "411": (24.1101, 120.6966, 3.0), "412": (24.0779, 120.7319, 2.5),
    "413": (24.0349, 120.7543, 3.0), "414": (24.0930, 120.6481, 2.0),
    "420": (24.2650, 120.6928, 2.5), "421": (24.3015, 120.6907, 3.0),
    "422": (24.2636, 120.7299, 2.0), "423": (24.1957, 120.7628, 4.0),
    "424": (24.1628, 120.7985, 8.0), "426": (24.2405, 120.6542, 2.5),
    "427": (24.2135, 120.6279, 2.0), "428": (24.2312, 120.6103, 2.5),
    "429": (24.2646, 120.5868, 2.0), "432": (24.2925, 120.5643, 2.0),
    "433": (24.2655, 120.5461, 2.0), "434": (24.2361, 120.5393, 2.0),
    "435": (24.2151, 120.5373, 1.5), "436": (24.2590, 120.4999, 2.5),
    "437": (24.3178, 120.5193, 2.5), "438": (24.3494, 120.5527, 2.5),
    "439": (24.3702, 120.5776, 2.5), "500": (24.0800, 120.5378, 2.0),
    "502": (24.0611, 120.5170, 2.5), "503": (24.0982, 120.5123, 2.5),
    "504": (24.1222, 120.5042, 2.0), "505": (24.1371, 120.4618, 3.0),
    "506": (24.1625, 120.4367, 2.5), "507": (24.1772, 120.4614, 2.5),
    "508": (24.1935, 120.4856, 2.0), "509": (24.1994, 120.5259, 2.0),
    "510": (24.0446, 120.5397, 2.0), "511": (24.0099, 120.5546, 2.5),
    "512": (24.0271, 120.5820, 2.0), "513": (24.0698, 120.5812, 2.0),
    "514": (24.0848, 120.5875, 2.0), "515": (24.1010, 120.5887, 2.0),
    "516": (24.0617, 120.6232, 2.5), "520": (23.9601, 120.5724, 2.5),
    "521": (23.9244, 120.5941, 2.0), "522": (23.9487, 120.5267, 2.5),
    "523": (23.9169, 120.5254, 2.5), "524": (23.9027, 120.4870, 2.5),
    "525": (23.8777, 120.5127, 2.5), "526": (23.8634, 120.5607, 3.0),
    "527": (23.8990, 120.4466, 3.0), "528": (23.9351, 120.4217, 4.0),
    "530": (24.0285, 120.4753, 2.5), "540": (23.9609, 120.6719, 2.5),
    "541": (23.9963, 120.7097, 4.0), "542": (23.9289, 120.6869, 3.0),
    "544": (23.8638, 120.7043, 5.0), "545": (23.8365, 120.7565, 3.0),
    "546": (23.8168, 120.8682, 10.0),"551": (23.8534, 120.6738, 3.0),
    "552": (23.8213, 120.6522, 2.5), "553": (23.8094, 120.6230, 4.0),
    "555": (23.7648, 120.6877, 4.0), "556": (23.7233, 120.6580, 8.0),
    "557": (23.8117, 120.5814, 3.0), "558": (23.7503, 120.5491, 4.0),
    "600": (23.4753, 120.4493, 2.0), "602": (23.4868, 120.4291, 2.0),
    "603": (23.5112, 120.3879, 3.0), "604": (23.5487, 120.3614, 4.0),
    "605": (23.5031, 120.4111, 8.0), "606": (23.4541, 120.3882, 3.0),
    "607": (23.4118, 120.4037, 5.0), "608": (23.4600, 120.4696, 2.5),
    "611": (23.4228, 120.4665, 2.5), "612": (23.3988, 120.4935, 2.0),
    "613": (23.3819, 120.5201, 2.0), "614": (23.3651, 120.5573, 3.0),
    "615": (23.3512, 120.5226, 2.5), "616": (23.3182, 120.4907, 2.5),
    "621": (23.3591, 120.4396, 2.5), "622": (23.3393, 120.3970, 2.5),
    "623": (23.3130, 120.4255, 2.5), "624": (23.2783, 120.4477, 3.0),
    "625": (23.2573, 120.4756, 2.5), "630": (23.7558, 120.4982, 2.0),
    "631": (23.7161, 120.4765, 2.5), "632": (23.6974, 120.4308, 2.5),
    "633": (23.7208, 120.4111, 2.5), "634": (23.6908, 120.3742, 2.5),
    "635": (23.6572, 120.3629, 2.5), "636": (23.6255, 120.3528, 3.0),
    "637": (23.6628, 120.3985, 2.5), "638": (23.6388, 120.4390, 2.5),
    "640": (23.7073, 120.5420, 2.5), "643": (23.6691, 120.5398, 3.0),
    "646": (23.6411, 120.5170, 3.5), "647": (23.6017, 120.5097, 2.5),
    "648": (23.5832, 120.5348, 2.0), "649": (23.5649, 120.5605, 2.5),
    "651": (23.5398, 120.4877, 2.5), "652": (23.5597, 120.4533, 3.0),
    "653": (23.5194, 120.4430, 3.0), "654": (23.4898, 120.4785, 3.0),
    "655": (23.4699, 120.4261, 2.5), "700": (22.9998, 120.2269, 1.0),
    "701": (22.9944, 120.2018, 1.5), "702": (22.9786, 120.1954, 1.5),
    "704": (23.0201, 120.2236, 1.5), "708": (23.0481, 120.2386, 1.5),
    "709": (23.0300, 120.1726, 3.0), "710": (23.0671, 120.3102, 2.5),
    "711": (23.0295, 120.3313, 2.5), "712": (22.9986, 120.3512, 3.0),
    "713": (23.0667, 120.3770, 3.0), "714": (23.0083, 120.3924, 3.5),
    "715": (22.9819, 120.4266, 4.0), "716": (23.0291, 120.4541, 5.0),
    "717": (23.0901, 120.3512, 2.0), "718": (23.1200, 120.3289, 2.5),
    "719": (23.0933, 120.3040, 3.0), "720": (23.1614, 120.2938, 2.5),
    "721": (23.1382, 120.2584, 2.5), "722": (23.1792, 120.3217, 2.5),
    "723": (23.2118, 120.3530, 2.0), "724": (23.1980, 120.3897, 3.0),
    "725": (23.1527, 120.3867, 3.0), "726": (23.1152, 120.4188, 3.0),
    "727": (23.1406, 120.4555, 2.5), "730": (23.1902, 120.2341, 2.5),
    "731": (23.2200, 120.2597, 3.0), "732": (23.2462, 120.2873, 3.0),
    "733": (23.2694, 120.3270, 4.0), "734": (23.2373, 120.3656, 2.5),
    "735": (23.1817, 120.4185, 2.5), "736": (23.1465, 120.4885, 3.0),
    "737": (23.1124, 120.4648, 2.5), "741": (22.9628, 120.1736, 2.5),
    "742": (22.9325, 120.1954, 3.0), "743": (22.9103, 120.2168, 2.0),
    "744": (22.8802, 120.2413, 2.5), "745": (22.8620, 120.2809, 2.5),
    "800": (22.6273, 120.3014, 1.0), "801": (22.6397, 120.3178, 1.0),
    "802": (22.6232, 120.3178, 1.5), "803": (22.6073, 120.2980, 1.0),
    "804": (22.6516, 120.2945, 2.0), "805": (22.6073, 120.3280, 1.5),
    "806": (22.5979, 120.3443, 2.5), "807": (22.6712, 120.3032, 2.5),
    "811": (22.6890, 120.3375, 2.5), "812": (22.7300, 120.3189, 3.0),
    "813": (22.5701, 120.3467, 2.0), "814": (22.7519, 120.3041, 2.5),
    "820": (22.7273, 120.2671, 2.5), "821": (22.7640, 120.3423, 3.0),
    "822": (22.7960, 120.3780, 3.0), "823": (22.8243, 120.3567, 3.0),
    "824": (22.8469, 120.3232, 4.0), "825": (22.8740, 120.2931, 3.0),
    "826": (22.8967, 120.3400, 2.5), "827": (22.9204, 120.3697, 2.5),
    "828": (22.9417, 120.4061, 2.5), "829": (22.9623, 120.4404, 2.5),
    "830": (22.9915, 120.4737, 2.5), "831": (22.7011, 120.4044, 3.0),
    "832": (22.6720, 120.4385, 3.0), "833": (22.6348, 120.4755, 3.0),
    "840": (22.5981, 120.4209, 2.0), "842": (22.5643, 120.4537, 4.0),
    "843": (22.5335, 120.4752, 4.0), "844": (22.5080, 120.4974, 4.0),
    "845": (22.4726, 120.5244, 6.0), "846": (22.5289, 120.5544, 4.0),
    "847": (22.5735, 120.5217, 4.0), "848": (22.6161, 120.5027, 5.0),
    "849": (22.7134, 120.5560, 8.0), "851": (22.7987, 120.6060, 6.0),
    "852": (22.8505, 120.6490, 6.0), "880": (23.5667, 119.5583, 3.0),
    "881": (23.6417, 119.6417, 3.0), "882": (23.4833, 119.5250, 3.0),
    "883": (23.3667, 119.5167, 2.0), "884": (23.6667, 119.6750, 3.0),
    "885": (23.7083, 119.6583, 3.0), "890": (24.4333, 118.3167, 2.5),
    "891": (24.5083, 118.3833, 3.0), "892": (24.5667, 118.4583, 3.0),
    "893": (24.4917, 118.4500, 3.0), "894": (24.3333, 118.2500, 3.0),
    "896": (24.0167, 117.9500, 2.0), "900": (22.6762, 120.4882, 2.5),
    "901": (22.7083, 120.4680, 5.0), "902": (22.7461, 120.4426, 6.0),
    "903": (22.6414, 120.5224, 3.0), "904": (22.6069, 120.5519, 2.5),
    "905": (22.5780, 120.5779, 3.0), "906": (22.5373, 120.6037, 4.0),
    "907": (22.5062, 120.6251, 3.0), "908": (22.4689, 120.5942, 2.5),
    "909": (22.5248, 120.5544, 2.0), "911": (22.6505, 120.5698, 2.5),
    "912": (22.6255, 120.5999, 3.0), "913": (22.5980, 120.6300, 3.0),
    "920": (22.5671, 120.6638, 2.5), "921": (22.5346, 120.6908, 4.0),
    "922": (22.5042, 120.7136, 5.0), "923": (22.5307, 120.7484, 3.5),
    "924": (22.5626, 120.7705, 2.5), "925": (22.5931, 120.7921, 3.0),
    "926": (22.6217, 120.8074, 2.5), "927": (22.6500, 120.8249, 2.0),
    "928": (22.6677, 120.8491, 2.5), "929": (22.6843, 120.8693, 3.0),
    "931": (22.7082, 120.8861, 2.5), "932": (22.7340, 120.9011, 2.5),
    "940": (22.3565, 120.5978, 3.5), "941": (22.3215, 120.6209, 3.0),
    "942": (22.3012, 120.6470, 5.0), "943": (22.2720, 120.6790, 5.0),
    "944": (22.2436, 120.7089, 3.0), "945": (22.2169, 120.7295, 6.0),
    "946": (22.0032, 120.7460, 4.0), "947": (22.0421, 120.7683, 5.0),
    "950": (22.7583, 121.1444, 2.5), "951": (22.8092, 121.1726, 3.0),
    "952": (22.5994, 121.4825, 5.0), "953": (22.7250, 121.1167, 5.0),
    "954": (22.7667, 121.0667, 4.0), "955": (22.7083, 121.0083, 5.0),
    "956": (22.7917, 121.1250, 4.0), "957": (22.8083, 121.1583, 6.0),
    "958": (22.9083, 121.1750, 4.0), "959": (23.0750, 121.2083, 4.0),
    "961": (23.2083, 121.3167, 3.0), "962": (23.3250, 121.3583, 5.0),
    "963": (23.4583, 121.3917, 4.0), "964": (23.5583, 121.3667, 6.0),
    "965": (23.6167, 121.3500, 4.0), "966": (23.7000, 121.3000, 5.0),
    "970": (23.9917, 121.6083, 2.5), "971": (24.1083, 121.6167, 3.0),
    "972": (24.2667, 121.6250, 10.0),"973": (24.0250, 121.6167, 2.5),
    "974": (23.9167, 121.5833, 4.0), "975": (23.8417, 121.5500, 3.0),
    "976": (23.7500, 121.5167, 4.0), "977": (23.6750, 121.5000, 5.0),
    "978": (23.6000, 121.4583, 4.0), "979": (23.4833, 121.4167, 5.0),
    "981": (23.3750, 121.3333, 4.0), "982": (23.2583, 121.3250, 6.0),
}


# ── 模組級 RNG（固定 seed 確保可重現，不污染全域 random state）─────────────────
_rng = random.Random(42)

def space_segment(text: str) -> str:
    if not text:
        return ""
    result = []
    current_word = []
    for char in text:
        # 僅對 ASCII 字母與數字（英文/數字）進行分組
        if char.isascii() and char.isalnum():
            current_word.append(char)
        else:
            if current_word:
                result.append("".join(current_word))
                current_word = []
            # 僅保留字母字元（包含常見與罕見中文字元），丟棄標點符號與空白
            if char.isalpha():
                result.append(char)
    if current_word:
        result.append("".join(current_word))
    return " ".join(result)

def normalize_text(text: str) -> str:
    text = unicodedata.normalize("NFKC", text.strip())
    return text.replace("臺", "台")

def normalize_tax_id(tax_id: Optional[str]) -> Optional[str]:
    if tax_id is None:
        return None
    cleaned = re.sub(r'[\s\u3000]+', '', str(tax_id))
    return cleaned if cleaned else None


def is_website(text: str) -> bool:
    text = text.lower()
    if "@" in text:
        return False
    if text.startswith("http") or text.startswith("www."):
        return True
    if ".com" in text or ".tw" in text or ".net" in text or ".org" in text:
        return True
    if not re.search(r'[\u4e00-\u9fff]', text) and ' ' not in text and re.search(r'\.[a-z]{2,6}(?:/|$)', text):
        return True
    return False

def split_merged(text: str) -> tuple[str, str]:
    parts = re.split(r'\s{2,}|\u3000+', text)
    if len(parts) >= 2:
        return parts[0].strip(), "".join(parts[1:]).strip()
    return text.strip(), ""

def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def atomic_write_text(path: str, data: str) -> None:
    """原子寫入文字檔：mkstemp + fsync + os.replace，避免 meta/hash 半寫入。"""
    import tempfile
    d = os.path.dirname(path) or "."
    os.makedirs(d, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=d)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except Exception:
        try:
            os.remove(tmp)
        except Exception:
            pass
        raise

def random_jitter(clat: float, clon: float, radius_km: float) -> Tuple[float, float]:
    r_km = _rng.uniform(0, radius_km * 0.8)
    angle = _rng.uniform(0, 2 * math.pi)
    dlat = (r_km / 111.0) * math.cos(angle)
    dlon = (r_km / (111.0 * math.cos(math.radians(clat)))) * math.sin(angle)
    return clat + dlat, clon + dlon

def zipcode_coords(zip_code: Optional[str]) -> Optional[Tuple[float, float]]:
    if not zip_code:
        return None
    key = str(zip_code).strip()[:3]
    entry = TAIWAN_ZIPCODES.get(key)
    if not entry:
        return None
    clat, clon, radius = entry
    return random_jitter(clat, clon, radius)


# ── 步驟函式 ─────────────────────────────────────────────────────────────────

def download_zip(dest: str) -> bool:
    """從政府開放資料下載 ZIP 檔，回傳是否成功。"""
    import socket
    socket.setdefaulttimeout(60)
    log.info(f"📥 下載資料：{DOWNLOAD_URL}")
    headers = {
        "User-Agent": "NationalTravelCardBot/1.0 (automated data update)"
    }
    
    from requests.adapters import HTTPAdapter
    from urllib3.util import Retry

    session = requests.Session()
    retries = Retry(
        total=5,
        backoff_factor=1,  # 指數重試：1s, 2s, 4s...
        status_forcelist=[429, 500, 502, 503, 504],
        raise_on_status=False
    )
    session.mount("https://", HTTPAdapter(max_retries=retries))
    session.mount("http://", HTTPAdapter(max_retries=retries))

    try:
        resp = session.get(DOWNLOAD_URL, headers=headers, timeout=60, stream=True)
        resp.raise_for_status()
        max_bytes = MAX_DOWNLOAD_MB * 1024 * 1024
        total = 0
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=65536):
                if not chunk:
                    continue
                total += len(chunk)
                if total > max_bytes:
                    log.error(f"❌ 下載超過上限 {MAX_DOWNLOAD_MB}MB，中止")
                    try:
                        f.close()
                    except Exception:
                        pass
                    try:
                        os.remove(dest)
                    except Exception:
                        pass
                    return False
                f.write(chunk)
        # content-type 檢查：拒收 html 錯誤頁
        content_type = resp.headers.get("Content-Type", "")
        if "text/html" in content_type.lower():
            log.error(f"❌ 下載內容為 HTML（Content-Type: {content_type}），疑似錯誤頁")
            try:
                os.remove(dest)
            except Exception:
                pass
            return False
        # ZIP 魔數校驗：前 4 bytes 須為 PK\x03\x04
        with open(dest, "rb") as f:
            magic = f.read(4)
        if magic != b"PK\x03\x04":
            log.error(f"❌ 下載檔案魔數不符（{magic!r}），非 ZIP")
            try:
                os.remove(dest)
            except Exception:
                pass
            return False
        size_mb = os.path.getsize(dest) / 1024 / 1024
        log.info(f"✅ 下載完成：{size_mb:.1f} MB")
        return True
    except Exception as e:
        log.error(f"❌ 下載失敗：{e}")
        return False

def extract_pdf(zip_path: str, dest: str) -> bool:
    """解壓縮 ZIP，取出第一個 PDF 檔，回傳是否成功。"""
    log.info("📦 解壓縮 ZIP...")
    try:
        with zipfile.ZipFile(zip_path, "r") as z:
            pdf_names = [n for n in z.namelist() if n.lower().endswith(".pdf")]
            if not pdf_names:
                log.error("❌ ZIP 中找不到 PDF 檔案")
                return False
            log.info(f"   PDF 檔案：{pdf_names[0]}")
            with z.open(pdf_names[0]) as src, open(dest, "wb") as dst:
                shutil.copyfileobj(src, dst)
        # PDF 魔數校驗：前 5 bytes 須為 b"%PDF-"
        with open(dest, "rb") as f:
            pdf_magic = f.read(5)
        if pdf_magic != b"%PDF-":
            log.error(f"❌ 解壓出檔案魔數不符（{pdf_magic!r}），非 PDF")
            try:
                os.remove(dest)
            except Exception:
                pass
            return False
        log.info("✅ 解壓縮完成")
        return True
    except Exception as e:
        log.error(f"❌ 解壓縮失敗：{e}")
        return False

def parse_pdf_to_db(pdf_path: str, db_path: str) -> int:
    """解析 PDF 並寫入 SQLite，回傳寫入筆數（失敗回傳 -1）。"""
    log.info(f"📄 解析 PDF → {db_path}")
    try:
        doc = fitz.open(pdf_path)
    except Exception as e:
        log.error(f"❌ 開啟 PDF 失敗：{e}")
        return -1

    # 初始化 DB
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        cursor = conn.cursor()
        cursor.execute("DROP TABLE IF EXISTS merchant_industries")
        cursor.execute("DROP TABLE IF EXISTS merchants")
        cursor.execute("""
            CREATE TABLE merchants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                address TEXT,
                zip_code TEXT,
                tax_id TEXT UNIQUE,
                website TEXT,
                lat REAL,
                lon REAL
            )
        """)
        cursor.execute("CREATE INDEX idx_name ON merchants(name)")
        cursor.execute("CREATE INDEX idx_zip_code ON merchants(zip_code)")
        cursor.execute("CREATE INDEX idx_tax_id ON merchants(tax_id)")
        cursor.execute("CREATE INDEX idx_lat_lon ON merchants(lat, lon)")
        
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS merchant_industries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tax_id TEXT NOT NULL,
                industry_code TEXT NOT NULL,
                industry_name TEXT NOT NULL,
                priority INTEGER NOT NULL,
                FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_merchant_industries_tax_id ON merchant_industries(tax_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_merchant_industries_code ON merchant_industries(industry_code)")
        
        # 同步建立 FTS 虛擬表
        cursor.execute("DROP TABLE IF EXISTS merchants_fts")
        cursor.execute("""
            CREATE VIRTUAL TABLE merchants_fts USING fts5(
                name,
                address,
                tokenize="unicode61"
            );
        """)
        conn.commit()

        # 讀取文字
        headers = {"特店名稱", "特店地址", "郵遞區號", "統一編號", "特店網頁位址", "國民旅遊卡特約商店清冊"}
        lines = []
        total_pages = len(doc)
        for page_num in range(0, total_pages):  # 從第 0 頁（包含封面）開始解析
            page = doc[page_num]
            text = page.get_text("text")
            for line in text.split("\n"):
                line = normalize_text(line)
                if line and line not in headers and not line.startswith("檔案日期"):
                    lines.append(line)

        # 預處理折行網址合併
        merged_lines = []
        i = 0
        while i < len(lines):
            line = lines[i]
            if i + 1 < len(lines) and is_website(line):
                next_line = lines[i + 1]
                if (not re.search(r'[\u4e00-\u9fff]', next_line) and 
                    not re.match(r'^\d{8}$', next_line) and 
                    not re.match(r'^\d{3,6}$', next_line) and 
                    ' ' not in next_line and
                    len(next_line) <= 15):
                    line = line + next_line
                    i += 1
            merged_lines.append(line)
            i += 1
        lines = merged_lines

        log.info(f"   讀取 {total_pages} 頁，共 {len(lines)} 行文字")

        # 以統一編號（8位數）定位每筆記錄
        tax_id_pattern = re.compile(r"^\d{8}$")
        tax_indices = [i for i, l in enumerate(lines) if tax_id_pattern.match(l)]
        log.info(f"   找到 {len(tax_indices)} 筆統一編號")

        records = []
        for k in range(len(tax_indices)):
            current_tax_idx = tax_indices[k]
            current_tax_id  = lines[current_tax_idx]
            current_zip     = lines[current_tax_idx - 1]
            prev_tax_idx    = tax_indices[k-1] if k > 0 else -1
            items = lines[prev_tax_idx + 1 : current_tax_idx - 1]

            name = address = ""
            prev_website = None

            if len(items) == 3:
                prev_website = items[0]
                n_part, a_part = split_merged(items[1])
                if a_part:
                    name = n_part
                    address = a_part + " " + items[2]
                else:
                    name = items[1]
                    address = items[2]
            elif len(items) == 2:
                if is_website(items[0]):
                    prev_website = items[0]
                    name, address = split_merged(items[1])
                else:
                    n_part, a_part = split_merged(items[0])
                    if a_part:
                        name = n_part
                        address = a_part + " " + items[1]
                    else:
                        name = items[0]
                        address = items[1]
            elif len(items) == 1:
                name, address = split_merged(items[0])
            elif len(items) == 0:
                continue
            else:
                if is_website(items[0]):
                    prev_website = items[0]
                    n_part, a_part = split_merged(items[1])
                    if a_part:
                        name = n_part
                        address = a_part + " " + "".join(items[2:])
                    else:
                        name = items[1]
                        address = "".join(items[2:])
                else:
                    n_part, a_part = split_merged(items[0])
                    if a_part:
                        name = n_part
                        address = a_part + " " + "".join(items[1:])
                    else:
                        name = items[0]
                        address = "".join(items[1:])

            if prev_website and k > 0:
                records[-1]["website"] = prev_website

            records.append({
                "name": name, "address": address,
                "zip_code": current_zip, "tax_id": current_tax_id,
                "website": None
            })

        # 處理最後一筆的網址
        if tax_indices:
            last_items = lines[tax_indices[-1] + 1:]
            if last_items and is_website(last_items[0]):
                records[-1]["website"] = last_items[0]

        insert_data = [
            (
                r["name"],
                r["address"],
                r["zip_code"],
                normalize_tax_id(r["tax_id"]),
                r["website"]
            )
            for r in records
        ]
        cursor.executemany(
            "INSERT OR IGNORE INTO merchants (name, address, zip_code, tax_id, website) VALUES (?, ?, ?, ?, ?)",
            insert_data
        )
        conn.commit()

        # 同步寫入 FTS5
        cursor.execute("SELECT id, name, address FROM merchants")
        inserted = cursor.fetchall()
        fts_insert = [(r[0], space_segment(r[1]), space_segment(r[2])) for r in inserted]
        cursor.executemany(
            "INSERT INTO merchants_fts (rowid, name, address) VALUES (?, ?, ?)",
            fts_insert
        )
        conn.commit()

        count = conn.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
        doc.close()
        log.info(f"✅ 解析完成，寫入 {count} 筆")
        return count
    finally:
        if conn:
            conn.close()

def validate_records(insert_data, count):
    """解析筆數閘門：筆數過少（<1000）視為壞解析，拒絕進同步。"""
    if count < 1000:
        log.error(f"Parse too few: {count}")
        return False
    return True

def migrate_coords(old_db: str, new_db: str) -> int:
    """從舊 DB 遷移 lat/lon 到新 DB（以 tax_id 對應），回傳遷移筆數。"""
    if not os.path.exists(old_db):
        log.info("ℹ️  無舊 DB，跳過座標遷移")
        return 0
    log.info("🗺️  從舊 DB 遷移座標...")
    old_conn = None
    new_conn = None
    try:
        old_conn = sqlite3.connect(old_db)
        old_conn.execute("PRAGMA foreign_keys = ON;")
        old_conn.execute("PRAGMA busy_timeout = 5000;")
        new_conn = sqlite3.connect(new_db)
        new_conn.execute("PRAGMA foreign_keys = ON;")
        new_conn.execute("PRAGMA busy_timeout = 5000;")
        rows = old_conn.execute(
            "SELECT tax_id, lat, lon FROM merchants WHERE lat IS NOT NULL AND tax_id IS NOT NULL AND trim(tax_id) != ''"
        ).fetchall()
        if rows:
            new_conn.executemany(
                "UPDATE merchants SET lat=?, lon=? WHERE tax_id=?",
                [(lat, lon, tid) for tid, lat, lon in rows]
            )
            new_conn.commit()

        null_rows = old_conn.execute(
            "SELECT name, address, lat, lon FROM merchants WHERE lat IS NOT NULL AND (tax_id IS NULL OR trim(tax_id) = '')"
        ).fetchall()
        if null_rows:
            new_conn.executemany(
                "UPDATE merchants SET lat=?, lon=? WHERE (tax_id IS NULL OR trim(tax_id) = '') AND name=? AND COALESCE(address, '')=COALESCE(?, '') AND lat IS NULL",
                [(lat, lon, name, address) for name, address, lat, lon in null_rows]
            )
            new_conn.commit()

        migrated = new_conn.execute("SELECT COUNT(*) FROM merchants WHERE lat IS NOT NULL").fetchone()[0]
        log.info(f"✅ 座標遷移完成：{migrated} 筆保留座標")
        return migrated
    finally:
        if old_conn:
            old_conn.close()
        if new_conn:
            new_conn.close()

def migrate_industries(old_db: str, new_db: str) -> int:
    """從舊 DB 遷移行業別資料到新 DB（以 tax_id 對應），回傳遷移筆數。"""
    if not os.path.exists(old_db):
        log.info("ℹ️  無舊 DB，跳過行業別資料遷移")
        return 0
    log.info("🏬  從舊 DB 遷移行業別資料...")
    old_conn = None
    new_conn = None
    try:
        old_conn = sqlite3.connect(old_db)
        old_conn.execute("PRAGMA foreign_keys = ON;")
        old_conn.execute("PRAGMA busy_timeout = 5000;")
        
        # 檢查舊表是否存在
        table_exists = old_conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_industries'"
        ).fetchone()
        if not table_exists:
            log.info("   舊 DB 無 merchant_industries 表")
            return 0
            
        rows = old_conn.execute(
            "SELECT tax_id, industry_code, industry_name, priority FROM merchant_industries"
        ).fetchall()
        
        if not rows:
            log.info("   舊 DB 無行業別資料")
            return 0
            
        new_conn = sqlite3.connect(new_db)
        new_conn.execute("PRAGMA foreign_keys = ON;")
        new_conn.execute("PRAGMA busy_timeout = 5000;")
        new_tax_ids = {row[0] for row in new_conn.execute("SELECT tax_id FROM merchants WHERE tax_id IS NOT NULL").fetchall()}
        
        filtered_rows = [(tid, code, name, priority) for tid, code, name, priority in rows if tid in new_tax_ids]
        if filtered_rows:
            new_conn.executemany(
                "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                filtered_rows
            )
            new_conn.commit()
        log.info(f"✅ 行業別資料遷移完成：{len(filtered_rows)} 筆")
        return len(filtered_rows)
    except Exception as e:
        log.error(f"⚠️ 遷移行業別資料失敗: {e}")
        return 0
    finally:
        if old_conn:
            old_conn.close()
        if new_conn:
            new_conn.close()

def fill_missing_coords(db_path: str) -> int:
    """對沒有座標的商家用郵遞區號 fallback 填補，回傳填補筆數。"""
    log.info("📍 用郵遞區號填補缺失座標...")
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        rows = conn.execute(
            "SELECT id, zip_code FROM merchants WHERE lat IS NULL AND zip_code IS NOT NULL"
        ).fetchall()
        batch = []
        skipped = 0
        for mid, zip_code in rows:
            coords = zipcode_coords(zip_code)
            if coords:
                batch.append((coords[0], coords[1], mid))
            else:
                skipped += 1
        if batch:
            conn.executemany("UPDATE merchants SET lat=?, lon=? WHERE id=?", batch)
            conn.commit()
        log.info(f"✅ 填補 {len(batch)} 筆（{skipped} 筆無對應郵遞區號）")
        return len(batch)
    finally:
        if conn:
            conn.close()


def prune_backups(target_db_path: str, keep: int = 7) -> int:
    """僅保留最新的 keep 份 timestamped .bak，刪除多餘舊備份。回傳刪除筆數。"""
    import glob
    baks = sorted(glob.glob(target_db_path + ".*.bak"))
    doomed = baks[:-keep] if keep > 0 and len(baks) > keep else []
    removed = 0
    for old in doomed:
        try:
            os.remove(old)
            removed += 1
        except Exception as e:
            log.warning(f"⚠️ 刪除舊備份失敗 {old}: {e}")
    if removed:
        log.info(f"🧹 已清理 {removed} 份舊備份（保留 {keep} 份）")
    return removed


def transactional_sync_db(temp_db_path: str, target_db_path: str) -> int:
    """
    將剛解析建好的 temp_db_path 資料以 SQLite 交易與 UPSERT 方式同步更新至 target_db_path。
    此方式可完整保留 target_db_path 中 users, user_expenses, user_favorites,
    user_itineraries, itinerary_items 等 5 張使用者個人資料表，
    並且維持既有特約商店之 id 主鍵與外鍵關聯不變。
    """
    try:
        from backend.database import init_db
    except ModuleNotFoundError:
        from vendor_backend_database import init_db  # type: ignore

    target_dir = os.path.dirname(target_db_path)
    if target_dir:
        os.makedirs(target_dir, exist_ok=True)

    # 1. 讀取 temp_db 資料
    temp_conn = sqlite3.connect(temp_db_path)
    temp_conn.row_factory = sqlite3.Row
    try:
        temp_merchants_rows = temp_conn.execute("SELECT name, address, zip_code, tax_id, website, lat, lon FROM merchants").fetchall()
        
        has_industries = temp_conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='merchant_industries'"
        ).fetchone()
        if has_industries:
            temp_industries_rows = temp_conn.execute("SELECT tax_id, industry_code, industry_name, priority FROM merchant_industries").fetchall()
        else:
            temp_industries_rows = []
    finally:
        temp_conn.close()

    # 2. 規範化 temp 資料 (Python 處理全形空白 \u3000 與空字串 -> None)
    normalized_temp_merchants = []
    for r in temp_merchants_rows:
        tid = normalize_tax_id(r["tax_id"])
        normalized_temp_merchants.append({
            "name": r["name"],
            "address": r["address"],
            "zip_code": r["zip_code"],
            "tax_id": tid,
            "website": r["website"],
            "lat": r["lat"],
            "lon": r["lon"]
        })

    normalized_temp_industries = []
    for r in temp_industries_rows:
        tid = normalize_tax_id(r["tax_id"])
        if tid:
            normalized_temp_industries.append({
                "tax_id": tid,
                "industry_code": r["industry_code"],
                "industry_name": r["industry_name"],
                "priority": r["priority"]
            })

    # 3. 連接 target_db 並在單一 BEGIN IMMEDIATE 交易中完成同步
    target_conn = sqlite3.connect(target_db_path, isolation_level=None, timeout=10.0)
    target_conn.execute("PRAGMA journal_mode = WAL;")
    target_conn.execute("PRAGMA busy_timeout = 5000;")
    target_conn.execute("PRAGMA foreign_keys = ON;")
    target_conn.execute("PRAGMA synchronous = NORMAL;")
    
    # 僅在資料庫尚未初始化時才執行 init_db，避免每次同步皆執行 DDL 導致 schema 鎖定與 Lock 衝突
    table_exists = target_conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='merchants'").fetchone()
    if not table_exists:
        init_db(target_conn)
        old_count = 0
    else:
        old_count = target_conn.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
    new_count = len(normalized_temp_merchants)

    # 0. 安全閘門：筆數驟降 abort（避免壞解析清空生產資料）
    # 閾值由環境變數 MASS_DELETE_MIN_OLD / MASS_DELETE_RATIO 控制
    try:
        _min_old = int(os.environ.get("MASS_DELETE_MIN_OLD", str(MASS_MIN_OLD)))
    except (ValueError, TypeError):
        _min_old = MASS_MIN_OLD
    try:
        _ratio = float(os.environ.get("MASS_DELETE_RATIO", str(MASS_RATIO)))
    except (ValueError, TypeError):
        _ratio = MASS_RATIO
    if old_count > _min_old and new_count < old_count * _ratio:
        target_conn.close()
        raise RuntimeError(f"Abort: new={new_count} < {_ratio*100:.0f}% of old={old_count}, refuse mass delete")

    # 0. 同步前 timestamped 備份
    if os.path.exists(target_db_path):
        try:
            bak = f"{target_db_path}.{datetime.now(TZ_TAIPEI).strftime('%Y%m%d-%H%M%S')}.bak"
            shutil.copy2(target_db_path, bak)
            log.info(f"💾 已備份同步前 DB → {bak}")
        except Exception as e:
            log.warning(f"⚠️ 同步前備份失敗: {e}")

    try:
        cursor = target_conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        removed_favorites = 0

        # 0. 規範化 target_db 既有資料的 tax_id
        cursor.execute("UPDATE merchants SET tax_id = NULLIF(TRIM(REPLACE(REPLACE(tax_id, CHAR(12288), ''), ' ', '')), '');")

        # 1. 有 tax_id 商家 UPSERT
        valid_tax_merchants = [m for m in normalized_temp_merchants if m["tax_id"] is not None]
        new_tax_ids = {m["tax_id"] for m in valid_tax_merchants}

        cursor.executemany("""
            INSERT INTO merchants (name, address, zip_code, tax_id, website, lat, lon)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tax_id) DO UPDATE SET
                name = excluded.name,
                address = excluded.address,
                zip_code = excluded.zip_code,
                website = excluded.website,
                lat = COALESCE(excluded.lat, merchants.lat),
                lon = COALESCE(excluded.lon, merchants.lon);
        """, [
            (m["name"], m["address"], m["zip_code"], m["tax_id"], m["website"], m["lat"], m["lon"])
            for m in valid_tax_merchants
        ])

        # 2. 無 tax_id 商家更新與新增
        no_tax_merchants = [m for m in normalized_temp_merchants if m["tax_id"] is None]
        seen_keys = set()
        unique_no_tax_merchants = []
        for m in no_tax_merchants:
            key = (m["name"], m["address"] or "")
            if key not in seen_keys:
                seen_keys.add(key)
                unique_no_tax_merchants.append(m)

        for m in unique_no_tax_merchants:
            updated = cursor.execute("""
                UPDATE merchants
                SET zip_code = ?, website = ?,
                    lat = COALESCE(?, lat), lon = COALESCE(?, lon)
                WHERE tax_id IS NULL AND name = ? AND COALESCE(address, '') = COALESCE(?, '')
            """, (m["zip_code"], m["website"], m["lat"], m["lon"], m["name"], m["address"])).rowcount

            if updated == 0:
                cursor.execute("""
                    INSERT INTO merchants (name, address, zip_code, tax_id, website, lat, lon)
                    VALUES (?, ?, ?, NULL, ?, ?, ?)
                """, (m["name"], m["address"], m["zip_code"], m["website"], m["lat"], m["lon"]))

        # 3. 刪除下架商家（先統計受影響 favorites，FK CASCADE 會連帶刪除）
        fav_exists = cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='user_favorites'"
        ).fetchone()
        if fav_exists:
            if new_tax_ids:
                placeholders = ",".join("?" for _ in new_tax_ids)
                doomed_ids = cursor.execute(
                    f"SELECT id FROM merchants WHERE tax_id IS NOT NULL AND tax_id NOT IN ({placeholders})",
                    list(new_tax_ids),
                ).fetchall()
            else:
                doomed_ids = cursor.execute(
                    "SELECT id FROM merchants WHERE tax_id IS NOT NULL"
                ).fetchall()
            if doomed_ids:
                ids = [r[0] for r in doomed_ids]
                qmarks = ",".join("?" for _ in ids)
                fav_count = cursor.execute(
                    f"SELECT COUNT(*) FROM user_favorites WHERE merchant_id IN ({qmarks})",
                    ids,
                ).fetchone()[0]
                removed_favorites = fav_count
                log.warning(
                    f"⚠️ 將刪除 {len(ids)} 間下架商家，影響 {fav_count} 筆 user_favorites 收藏（CASCADE 連帶刪除）"
                )
            else:
                removed_favorites = 0
                log.info("ℹ️ 無下架商家，無 favorites 受影響")
        else:
            removed_favorites = 0

        if new_tax_ids:
            placeholders = ",".join("?" for _ in new_tax_ids)
            cursor.execute(f"DELETE FROM merchants WHERE tax_id IS NOT NULL AND tax_id NOT IN ({placeholders})", list(new_tax_ids))
        else:
            cursor.execute("DELETE FROM merchants WHERE tax_id IS NOT NULL")

        no_tax_keys = {(m["name"], m["address"] or "") for m in unique_no_tax_merchants}
        existing_no_tax = cursor.execute("SELECT id, name, address FROM merchants WHERE tax_id IS NULL").fetchall()
        for eid, ename, eaddr in existing_no_tax:
            if (ename, eaddr or "") not in no_tax_keys:
                cursor.execute("DELETE FROM merchants WHERE id = ?", (eid,))

        # 4. 同步 merchant_industries — temp 為空則跳過以保護現有資料
        if normalized_temp_industries:
            cursor.execute("DELETE FROM merchant_industries;")
            target_tax_ids = {row[0] for row in cursor.execute("SELECT tax_id FROM merchants WHERE tax_id IS NOT NULL").fetchall()}
            
            valid_industries = [
                (ind["tax_id"], ind["industry_code"], ind["industry_name"], ind["priority"])
                for ind in normalized_temp_industries
                if ind["tax_id"] in target_tax_ids
            ]
            if valid_industries:
                cursor.executemany("""
                    INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority)
                    VALUES (?, ?, ?, ?);
                """, valid_industries)
        else:
            log.warning("⚠️ temp 無行業別資料，跳過 industries 同步以保護現有資料")

        # 5. 重建 merchants_fts
        cursor.execute("DELETE FROM merchants_fts;")
        merchant_rows = cursor.execute("SELECT id, name, address FROM merchants;").fetchall()
        fts_batch = [(r[0], space_segment(r[1]), space_segment(r[2])) for r in merchant_rows]
        cursor.executemany("INSERT INTO merchants_fts (rowid, name, address) VALUES (?, ?, ?);", fts_batch)

        cursor.execute("COMMIT")
        log.info(f"✅ 交易式同步 DB 成功：{target_db_path}")

    except Exception as e:
        try:
            cursor.execute("ROLLBACK")
        except Exception:
            pass
        log.error(f"❌ 交易式同步 DB 失敗，已 Rollback：{e}")
        raise e
    finally:
        target_conn.close()

    # 同步成功後清理舊備份，僅保留最近 7 份
    try:
        prune_backups(target_db_path, keep=7)
    except Exception as e:
        log.warning(f"⚠️ 清理舊備份失敗: {e}")
    return removed_favorites


def atomic_swap_db(temp_db_path: str, target_db_path: str) -> None:
    """
    將剛解析建好的 temp_db_path 原子性替換至 target_db_path。
    若舊 DB 存在則備份，並透過 os.replace 完成檔案層級替換，
    避免線上 API 查詢時遇到 DROP TABLE 或連線鎖定錯誤。
    """
    backup_path = target_db_path + ".bak"
    if os.path.exists(target_db_path):
        try:
            shutil.copy2(target_db_path, backup_path)
            log.info(f"💾 已備份舊 DB → {backup_path}")
        except Exception as e:
            log.warning(f"⚠️ 備份舊 DB 失敗: {e}")

    try:
        os.chmod(temp_db_path, 0o644)
    except Exception:
        pass

    os.replace(temp_db_path, target_db_path)
    log.info(f"✅ 原子性替換 DB 成功：{target_db_path}")

    for ext in ["-wal", "-shm"]:
        old_wal = target_db_path + ext
        if os.path.exists(old_wal):
            try:
                os.remove(old_wal)
            except Exception:
                pass


# ── 主流程 ───────────────────────────────────────────────────────────────────

def main():
    start_time = datetime.now(TZ_TAIPEI)
    removed_favorites = 0
    log.info("=" * 60)
    log.info(f"🚀 開始更新資料 — {start_time.strftime('%Y-%m-%d %H:%M:%S %Z')}")
    log.info("=" * 60)

    os.makedirs(DATA_DIR, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="ntc_") as tmpdir:
        zip_path = os.path.join(tmpdir, "download.zip")
        pdf_path = os.path.join(tmpdir, "merchants.pdf")
        new_db   = os.path.join(tmpdir, "merchants_new.db")

        # 1. 下載
        if not download_zip(zip_path):
            log.error("❌ 更新中止（下載失敗）")
            notify("❌ 國旅卡更新中止（下載失敗）")
            sys.exit(1)

        # 2. 解壓
        if not extract_pdf(zip_path, pdf_path):
            log.error("❌ 更新中止（解壓失敗）")
            notify("❌ 國旅卡更新中止（解壓失敗）")
            sys.exit(1)

        # 3. 比對 hash
        new_hash = sha256_file(pdf_path)
        log.info(f"🔑 PDF SHA256：{new_hash[:16]}...")
        old_hash = ""
        if os.path.exists(HASH_FILE):
            with open(HASH_FILE) as f:
                old_hash = f.read().strip()

        if new_hash == old_hash:
            log.info("✅ PDF 無變更，無需更新，結束")
            return

        log.info("🆕 偵測到新版 PDF，開始更新...")

        # 讀取舊的商家集合（用於統計）
        old_tax_ids = set()
        if os.path.exists(DB_PATH):
            old_conn = None
            try:
                old_conn = sqlite3.connect(DB_PATH)
                old_conn.execute("PRAGMA foreign_keys = ON;")
                old_conn.execute("PRAGMA busy_timeout = 5000;")
                for row in old_conn.execute("SELECT tax_id FROM merchants WHERE tax_id IS NOT NULL"):
                    old_tax_ids.add(row[0])
            except Exception:
                pass
            finally:
                if old_conn:
                    old_conn.close()

        # 4. 解析 PDF → 暫存 DB
        new_count = parse_pdf_to_db(pdf_path, new_db)
        if new_count < 0:
            log.error("❌ 更新中止（PDF 解析失敗）")
            notify("❌ 國旅卡更新中止（PDF 解析失敗）")
            sys.exit(1)
        if not validate_records([], new_count):
            log.error("❌ 更新中止（解析筆數過少）")
            notify(f"❌ 國旅卡更新中止（解析筆數過少：{new_count}）")
            sys.exit(1)

        # 讀取新的商家集合（用於統計）
        new_tax_ids = set()
        tmp_conn = None
        try:
            tmp_conn = sqlite3.connect(new_db)
            tmp_conn.execute("PRAGMA foreign_keys = ON;")
            tmp_conn.execute("PRAGMA busy_timeout = 5000;")
            for row in tmp_conn.execute("SELECT tax_id FROM merchants WHERE tax_id IS NOT NULL"):
                new_tax_ids.add(row[0])
        except Exception:
            pass
        finally:
            if tmp_conn:
                tmp_conn.close()
            
        added_count = len(new_tax_ids - old_tax_ids) if old_tax_ids else new_count
        removed_count = len(old_tax_ids - new_tax_ids) if old_tax_ids else 0

        # 5. 遷移座標
        migrate_coords(DB_PATH, new_db)
        migrate_industries(DB_PATH, new_db)

        # 6. 填補缺失座標
        fill_missing_coords(new_db)
        
        # 7. 交易式同步至生產 DB（保護 5 張使用者資料表）
        try:
            removed_favorites = transactional_sync_db(new_db, DB_PATH)
        except Exception as e:
            log.error(f"❌ 更新中止（同步失敗）：{e}")
            notify(f"❌ 國旅卡更新中止（同步失敗）：{e}")
            sys.exit(1)
        log.info(f"✅ DB 已更新：{DB_PATH}")


    # 8. 記錄 hash（原子寫入）
    atomic_write_text(HASH_FILE, new_hash)

    # 9. 寫入 metadata（原子寫入）
    end_time = datetime.now(TZ_TAIPEI)
    meta = {
        "last_updated": end_time.isoformat(),
        "pdf_hash": new_hash,
        "total_merchants": new_count,
        "new_merchants": added_count,
        "removed_merchants": removed_count,
        "removed_favorites": removed_favorites,
        "duration_seconds": round((end_time - start_time).total_seconds(), 1),
    }
    atomic_write_text(META_FILE, json.dumps(meta, ensure_ascii=False, indent=2))

    log.info("=" * 60)
    log.info(f"🎉 更新完成！耗時 {meta['duration_seconds']} 秒")
    log.info(f"   商家總數：{new_count:,}（新增 {added_count:,} 筆，移除 {removed_count:,} 筆）")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
