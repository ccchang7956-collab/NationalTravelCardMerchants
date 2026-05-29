"""
使用 Nominatim (OpenStreetMap) API 將商店地址轉換為真實座標。
功能：
  - 地址快取（相同地址不重複查詢）
  - Rate limiting（1 req/sec，符合 Nominatim 使用政策）
  - 斷點續傳（只處理 lat IS NULL 的記錄）
  - 失敗自動 fallback 到郵遞區號中心（保留舊座標邏輯）

用法：
  python scripts/geocode_real.py             # 跑全部
  python scripts/geocode_real.py --limit 50  # 只跑前 50 筆（測試用）
  python scripts/geocode_real.py --dry-run   # 只印出要查的地址，不寫入 DB
"""

import sqlite3
import json
import time
import math
import random
import argparse
import os
import sys
import re
from typing import Optional, Dict, Tuple

try:
    import requests
except ImportError:
    print("請先安裝 requests：pip install requests")
    sys.exit(1)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "backend", "merchants.db")
CACHE_PATH = os.path.join(SCRIPT_DIR, "geocode_cache.json")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "NationalTravelCardMerchantsApp/1.0 (research project)"

# 台灣郵遞區號 fallback 座標（與 geocode_zipcodes.py 相同）
ZIPCODE_CENTER: Dict[str, Tuple[float, float, float]] = {
    "100": (25.0413, 121.5226, 0.5), "103": (25.0628, 121.5098, 0.4),
    "104": (25.0636, 121.5323, 0.6), "105": (25.0503, 121.5771, 0.5),
    "106": (25.0256, 121.5436, 0.6), "108": (25.0341, 121.4994, 0.5),
    "110": (25.0330, 121.5654, 0.6), "111": (25.0930, 121.5268, 1.2),
    "112": (25.1365, 121.4986, 1.5), "114": (25.0832, 121.5876, 1.0),
    "115": (25.0549, 121.6070, 0.8), "116": (24.9984, 121.5696, 1.2),
    "220": (25.0138, 121.4630, 1.0), "221": (25.0675, 121.6639, 1.0),
    "231": (24.9708, 121.5338, 1.2), "234": (25.0103, 121.5183, 0.5),
    "235": (24.9955, 121.4982, 0.6), "241": (25.0607, 121.4882, 0.6),
    "242": (25.0354, 121.4500, 0.8), "247": (25.0832, 121.4680, 0.5),
    "200": (25.1276, 121.7392, 0.4), "201": (25.1491, 121.7612, 0.5),
    "202": (25.1591, 121.7347, 0.6), "203": (25.1312, 121.7588, 0.5),
    "320": (24.9937, 121.3009, 1.0), "330": (24.9936, 121.3010, 1.0),
    "300": (24.8036, 120.9686, 0.8), "302": (24.8388, 121.0144, 0.8),
    "400": (24.1477, 120.6736, 0.4), "401": (24.1612, 120.6891, 0.6),
    "402": (24.1311, 120.6669, 0.6), "403": (24.1729, 120.6530, 0.6),
    "404": (24.1824, 120.6719, 0.6), "406": (24.2093, 120.7123, 0.8),
    "407": (24.2076, 120.6567, 1.0), "408": (24.1561, 120.6343, 0.8),
    "420": (24.2650, 120.6928, 1.0), "500": (24.0800, 120.5378, 0.8),
    "540": (23.9609, 120.6719, 1.0), "600": (23.4753, 120.4493, 0.8),
    "602": (23.4868, 120.4291, 0.8), "630": (23.7558, 120.4982, 0.8),
    "640": (23.7073, 120.5420, 1.0), "648": (23.5832, 120.5348, 0.8),
    "700": (22.9998, 120.2269, 0.4), "701": (22.9944, 120.2018, 0.6),
    "702": (22.9786, 120.1954, 0.6), "704": (23.0201, 120.2236, 0.6),
    "710": (23.0671, 120.3102, 1.0), "730": (23.1902, 120.2341, 1.0),
    "800": (22.6273, 120.3014, 0.4), "801": (22.6397, 120.3178, 0.4),
    "802": (22.6232, 120.3178, 0.6), "803": (22.6073, 120.2980, 0.4),
    "807": (22.6712, 120.3032, 1.0), "811": (22.6890, 120.3375, 1.0),
    "831": (22.7011, 120.4044, 1.2), "900": (22.6762, 120.4882, 1.0),
    "950": (22.7583, 121.1444, 1.0), "970": (23.9917, 121.6083, 1.0),
    "971": (24.1083, 121.6167, 1.2), "973": (24.0250, 121.6167, 1.0),
    "260": (24.7583, 121.7583, 0.8), "265": (24.6917, 121.7750, 1.0),
    "880": (23.5667, 119.5583, 1.2), "890": (24.4333, 118.3167, 1.0),
}


def load_cache() -> dict:
    if os.path.exists(CACHE_PATH):
        with open(CACHE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_cache(cache: dict):
    with open(CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def clean_address(address: str) -> str:
    """清理地址字串，移除多餘空白和樓層資訊，提升 geocoding 準確度。"""
    addr = address.strip()
    # 移除多餘空白（花蓮縣花蓮市  中正路 → 花蓮縣花蓮市中正路）
    addr = re.sub(r'\s+', '', addr)
    # 移除括號內容（通常是說明文字）
    addr = re.sub(r'（[^）]*）', '', addr)
    addr = re.sub(r'\([^)]*\)', '', addr)
    # 移除樓層（1樓、1F、B1 等）
    addr = re.sub(r'\d+[FfBb樓]\w*', '', addr)
    addr = re.sub(r'[BbGg][0-9]?$', '', addr)
    # 移除部分、全部等字眼
    addr = re.sub(r'(部分|全部|及[0-9樓FBb]+)$', '', addr)
    return addr.strip()


def nominatim_geocode(address: str, session: requests.Session) -> Optional[tuple]:
    """查詢 Nominatim API，回傳 (lat, lon) 或 None。"""
    params = {
        "q": address + ", Taiwan",
        "format": "json",
        "limit": 1,
        "countrycodes": "tw",
        "addressdetails": 0,
    }
    headers = {"User-Agent": USER_AGENT}
    try:
        resp = session.get(NOMINATIM_URL, params=params, headers=headers, timeout=10)
        resp.raise_for_status()
        results = resp.json()
        if results:
            return float(results[0]["lat"]), float(results[0]["lon"])
    except Exception as e:
        print(f"    ⚠️  API 錯誤: {e}")
    return None


def fallback_coords(zip_code: Optional[str]) -> Optional[tuple]:
    """查無 geocode 結果時，用郵遞區號中心點 + 微小隨機偏移作為 fallback。"""
    if not zip_code:
        return None
    key = str(zip_code).strip()[:3]
    entry = ZIPCODE_CENTER.get(key)
    if not entry:
        return None
    clat, clon, radius = entry
    # 使用更小的 jitter（0.3 km），比原本的 radius_km 小很多
    r_km = random.uniform(0, min(radius, 0.3))
    angle = random.uniform(0, 2 * math.pi)
    dlat = (r_km / 111.0) * math.cos(angle)
    dlon = (r_km / (111.0 * math.cos(math.radians(clat)))) * math.sin(angle)
    return clat + dlat, clon + dlon


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None,
                        help="限制處理筆數（測試用）")
    parser.add_argument("--dry-run", action="store_true",
                        help="只印出地址，不寫入 DB")
    parser.add_argument("--reset", action="store_true",
                        help="重置所有座標為 NULL，重新跑全部")
    parser.add_argument("--city", type=str, default=None,
                        help="只處理特定城市，例如 '花蓮縣'")
    args = parser.parse_args()

    random.seed(123)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 確保欄位存在
    for col in ["lat", "lon"]:
        try:
            cursor.execute(f"ALTER TABLE merchants ADD COLUMN {col} REAL")
            conn.commit()
        except sqlite3.OperationalError:
            pass

    if args.reset:
        print("⚠️  重置所有座標為 NULL...")
        cursor.execute("UPDATE merchants SET lat = NULL, lon = NULL")
        conn.commit()

    # 查詢需要處理的記錄
    sql = "SELECT id, name, address, zip_code FROM merchants WHERE lat IS NULL"
    params = []
    if args.city:
        sql += " AND address LIKE ?"
        params.append(f"{args.city}%")
    sql += " ORDER BY id"
    if args.limit:
        sql += f" LIMIT {args.limit}"

    cursor.execute(sql, params)
    merchants = cursor.fetchall()
    total = len(merchants)

    if total == 0:
        print("✅ 沒有需要處理的記錄（所有商店都已有座標）")
        print("   提示：用 --reset 旗標可重置座標重新跑")
        conn.close()
        return

    print(f"📍 準備 geocode {total} 間商店...")
    if args.dry_run:
        print("🔍 Dry-run 模式，只列出地址，不寫入 DB\n")

    # 載入快取
    cache = load_cache()
    print(f"   快取已有 {len(cache)} 筆地址記錄")

    session = requests.Session()

    geocoded = 0      # 成功用 Nominatim 取得座標
    from_cache = 0    # 從快取取得
    fallback_used = 0  # 用 fallback
    failed = 0        # 完全失敗（沒有 zip_code 也沒查到）
    batch = []
    save_every = 50   # 每 50 筆存一次快取和 DB

    for i, m in enumerate(merchants):
        addr_raw = m["address"] or ""
        addr_clean = clean_address(addr_raw)
        name = m["name"] or ""

        if args.dry_run:
            print(f"[{i+1}/{total}] {name} → {addr_clean}")
            continue

        print(f"[{i+1}/{total}] {name[:25]:<25} {addr_clean[:40]}", end=" ", flush=True)

        lat, lon = None, None
        source = ""

        # 1. 先查快取
        cache_key = addr_clean
        if cache_key in cache:
            cached = cache[cache_key]
            if cached is not None:
                lat, lon = cached["lat"], cached["lon"]
                source = "cache"
                from_cache += 1
            else:
                # 快取記錄為失敗，用 fallback
                coords = fallback_coords(m["zip_code"])
                if coords:
                    lat, lon = coords
                    source = "fallback(cached_fail)"
                    fallback_used += 1
                else:
                    failed += 1
                    source = "failed"
        else:
            # 2. 呼叫 Nominatim API
            result = nominatim_geocode(addr_clean, session)
            time.sleep(1.1)  # 嚴格遵守 1 req/sec 限制

            if result:
                lat, lon = result
                cache[cache_key] = {"lat": lat, "lon": lon}
                geocoded += 1
                source = "nominatim"
            else:
                # 3. 嘗試只用城市 + 路名（去掉門牌號）
                addr_short = re.sub(r'\d+[之-]?\d*號.*$', '', addr_clean)
                if addr_short != addr_clean and len(addr_short) > 6:
                    result2 = nominatim_geocode(addr_short, session)
                    time.sleep(1.1)
                    if result2:
                        lat, lon = result2
                        cache[cache_key] = {"lat": lat, "lon": lon}
                        geocoded += 1
                        source = "nominatim(short)"
                    else:
                        cache[cache_key] = None

                if lat is None:
                    # 4. Fallback 到郵遞區號中心
                    coords = fallback_coords(m["zip_code"])
                    if coords:
                        lat, lon = coords
                        fallback_used += 1
                        source = "fallback"
                    else:
                        failed += 1
                        source = "failed"
                    if cache_key not in cache:
                        cache[cache_key] = None

        if lat is not None:
            batch.append((lat, lon, m["id"]))
            print(f"→ {source} ({lat:.5f}, {lon:.5f})")
        else:
            print(f"→ {source}")

        # 每 save_every 筆儲存一次
        if (i + 1) % save_every == 0:
            if batch:
                cursor.executemany(
                    "UPDATE merchants SET lat = ?, lon = ? WHERE id = ?", batch
                )
                conn.commit()
                batch = []
            save_cache(cache)
            pct = (i + 1) / total * 100
            print(f"\n  💾 已儲存 [{i+1}/{total}] ({pct:.1f}%) — "
                  f"nominatim:{geocoded} cache:{from_cache} fallback:{fallback_used} 失敗:{failed}\n")

    # 最後一批
    if batch:
        cursor.executemany(
            "UPDATE merchants SET lat = ?, lon = ? WHERE id = ?", batch
        )
        conn.commit()
    save_cache(cache)

    print(f"\n{'='*60}")
    print(f"✅ 完成！")
    print(f"   Nominatim 真實 geocoding : {geocoded} 筆")
    print(f"   從快取取得               : {from_cache} 筆")
    print(f"   Fallback（郵遞區號中心）  : {fallback_used} 筆")
    print(f"   完全失敗（無座標）        : {failed} 筆")

    conn.close()


if __name__ == "__main__":
    main()
