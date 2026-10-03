#!/usr/bin/env python3
"""
國旅卡特約商店清冊自動更新腳本
由 supercronic 排程每天凌晨 3:00（台灣時間）執行。

流程：
  1. 從政府開放資料下載最新 PDF（ZIP 格式）
  2. 計算 SHA256 hash，若與上次相同仍檢查本地 schema／FTS 版本
  3. 解析 PDF → 寫入暫存 DB
  4. 比對商家識別及正規化地址，遷移有效的完整座標與來源
  5. 用郵遞區號 fallback 填補新商家座標
  6. SQLite 備份後以單一 UPSERT 交易更新，保留商家 ID 及使用者關聯
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
import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Tuple

import requests
import fitz  # PyMuPDF

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from shared.backups import backup_database
from shared.coordinates import same_address, valid_coordinates, preservable_coordinates
from shared.search import space_segment, normalize_text
from shared.schema import ensure_schema, rebuild_search_index, bump_dataset_version, migrate_database, set_metadata
from shared.config import env_number
from shared.postal import TAIWAN_ZIPCODES, zipcode_coords
from shared.locking import database_lock

# ── 設定 ────────────────────────────────────────────────────────────────────
DOWNLOAD_URL = "https://travel.nccc.com.tw/NASApp/NTC/html/RetailerFileDownload.jsp"
DB_PATH      = os.environ.get("DB_PATH", "/data/merchants.db")
DATA_DIR     = str(Path(DB_PATH).parent)
HASH_FILE    = os.path.join(DATA_DIR, "pdf_hash.txt")
META_FILE    = os.path.join(DATA_DIR, "update_meta.json")

# 大量刪除安全閘門（可用環境變數覆寫）
MASS_MIN_OLD = 100
MASS_RATIO = 0.5

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
# 注意：必須在 notify() 內即時讀取環境變數，不可在模組頂層快取，
# 否則測試／容器啟動後變更 env 不會生效。

def notify(msg: str) -> None:
    notify_url = os.environ.get("NOTIFY_WEBHOOK_URL", "")
    if notify_url:
        try:
            requests.post(notify_url, json={"text": msg}, timeout=10)
        except Exception as e:
            log.warning(f"notify failed: {e}")

# ── 台灣郵遞區號 → (lat, lon, radius_km) ───────────────────────────────────



# ── 模組級 RNG（固定 seed 確保可重現，不污染全域 random state）─────────────────


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

def record_check(result: str, note: str = "") -> None:
    """記錄一次排程檢查（成功/跳過/失敗都會留痕）。

    背景：過去只有資料異動才寫 update_meta.json，「今日已檢查但無新資料」與
    「排程根本沒跑」長得一模一樣（last_updated 都停住）。從此每次執行都更新
    last_checked＋last_check_result，health/前端據此判斷管線是否存活。
    result: updated | skipped_no_change | failed
    """
    meta: dict = {}
    try:
        if os.path.exists(META_FILE):
            with open(META_FILE, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    meta = loaded
    except Exception:
        meta = {}
    meta["last_checked"] = datetime.now(TZ_TAIPEI).isoformat()
    meta["last_check_result"] = result
    if result in ("updated", "skipped_no_change"):
        meta["last_successful_check"] = meta["last_checked"]
    if note:
        meta["last_check_note"] = note
    elif "last_check_note" in meta and result != "failed":
        meta.pop("last_check_note", None)
    try:
        atomic_write_text(META_FILE, json.dumps(meta, ensure_ascii=False, indent=2))
    except Exception as e:
        log.warning(f"⚠️ 寫入檢查記錄失敗: {e}")


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
        # backend 以 ntcuser 讀取，scheduler 手動 exec 可能為 root：統一 644 避免 600 造成 backend 讀不到
        try:
            os.chmod(path, 0o644)
        except Exception:
            pass
    except Exception:
        try:
            os.remove(tmp)
        except Exception:
            pass
        raise






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
        # 魔數優先：官方站會誤送 Content-Type: text/html（實為 ZIP），以魔數為準
        # 見 Content-Disposition: attachment; filename=QualifiedRetailerList.zip
        with open(dest, "rb") as f:
            magic = f.read(4)
        content_type = resp.headers.get("Content-Type", "")
        if magic == b"PK\x03\x04":
            if "text/html" in content_type.lower():
                log.warning(f"⚠️ Content-Type 為 {content_type} 但魔數為 ZIP，仍接受（server 誤設）")
        else:
            # 非 ZIP：若 content-type 是 html 或魔數像 html，視為錯誤頁
            with open(dest, "rb") as f:
                head = f.read(1024).lstrip().lower()
            if "text/html" in content_type.lower() or head.startswith(b"<html") or head.startswith(b"<!doctype"):
                log.error(f"❌ 下載內容為 HTML（Content-Type: {content_type}），疑似錯誤頁")
                try:
                    os.remove(dest)
                except Exception:
                    pass
                return False
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
        ignored = len(insert_data) - count
        if ignored > 0:
            # 同稅號多分店只留第一家（UNIQUE＋OR IGNORE）：有數就告警，不再無聲丟
            log.warning(f"⚠️ {ignored} 筆因 tax_id 重複被忽略（一稅號只留第一家）")
        doc.close()
        log.info(f"✅ 解析完成，寫入 {count} 筆")
        return count
    finally:
        if conn:
            conn.close()

def validate_records(count, *, min_expected=1000):
    """解析筆數閘門：低於絕對下限視為壞解析，拒絕進同步。

    相對閘門（驟降 abort）由 transactional_sync_db 的 MASS 閘門負責；
    這裡只擋災難性壞掉。舊簽名 validate_records(insert_data, count) 已移除。
    """
    if count < min_expected:
        log.error(f"Parse too few: {count} < {min_expected}")
        return False
    return True

def migrate_coords(old_db: str, new_db: str) -> int:
    """只有統編與地址相符才保留完整有效座標，回傳遷移筆數。"""
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
        ensure_schema(new_conn)
        from shared.coordinates import normalize_address
        columns = {row[1] for row in old_conn.execute("PRAGMA table_info(merchants)")}
        extras = [column if column in columns else "NULL" for column in ("coord_source", "coord_accuracy", "geocoded_address")]
        old_coords = {}
        for tid, name, address, lat, lon, source, accuracy, located_address in old_conn.execute(
            "SELECT tax_id,name,address,lat,lon," + ",".join(extras) + " FROM merchants"
        ):
            if not valid_coordinates(lat, lon) or (located_address and not same_address(address, located_address)):
                continue
            tid = normalize_tax_id(tid)
            key = (tid or name, normalize_address(address), bool(tid))
            old_coords[key] = (lat, lon, source or "legacy_unknown", accuracy or "unknown", address)
        batch = []
        for mid, tid, name, address, lat, lon in new_conn.execute("SELECT id,tax_id,name,address,lat,lon FROM merchants"):
            if valid_coordinates(lat, lon):
                continue
            tid = normalize_tax_id(tid)
            preserved = old_coords.get((tid or name, normalize_address(address), bool(tid)))
            if preserved:
                batch.append((*preserved, mid))
        new_conn.executemany("UPDATE merchants SET lat=?,lon=?,coord_source=?,coord_accuracy=?,geocoded_address=? WHERE id=?", batch)
        migrated = len(batch)
        new_conn.commit()
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
        ensure_schema(conn)
        rows = conn.execute(
            "SELECT id, zip_code FROM merchants WHERE (lat IS NULL OR lon IS NULL) AND zip_code IS NOT NULL"
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
            conn.executemany("UPDATE merchants SET lat=?, lon=?,coord_source='postal_estimate',coord_accuracy='estimated',geocoded_address=address WHERE id=?", batch)
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
    with database_lock(target_db_path):
        return _transactional_sync_db(temp_db_path, target_db_path)


def _transactional_sync_db(temp_db_path: str, target_db_path: str) -> int:
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
        columns = {row[1] for row in temp_conn.execute("PRAGMA table_info(merchants)")}
        if not {"name", "address", "zip_code", "tax_id", "website", "lat", "lon"}.issubset(columns):
            raise RuntimeError("Incoming merchant schema is incomplete")
        temp_merchants_rows = temp_conn.execute("SELECT * FROM merchants").fetchall()
        
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
        located_address = r["geocoded_address"] if "geocoded_address" in r.keys() else None
        valid = valid_coordinates(r["lat"], r["lon"]) and (not located_address or same_address(r["address"], located_address))
        source = r["coord_source"] if "coord_source" in r.keys() else None
        source = source if source in ("address_geocode", "postal_estimate", "legacy_unknown") else "legacy_unknown"
        normalized_temp_merchants.append({
            "name": r["name"],
            "address": r["address"],
            "zip_code": r["zip_code"],
            "tax_id": tid,
            "website": r["website"],
            "lat": r["lat"] if valid else None,
            "lon": r["lon"] if valid else None,
            "coord_source": source if valid else None,
            "coord_accuracy": ("unknown" if source == "legacy_unknown" else "estimated") if valid else None,
            "geocoded_address": r["address"] if valid else None,
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
    target_conn.create_function("same_address", 2, same_address, deterministic=True)
    target_conn.create_function("valid_coordinates", 2, valid_coordinates, deterministic=True)
    target_conn.create_function("preservable_coordinates", 4, preservable_coordinates, deterministic=True)
    
    # 僅在資料庫尚未初始化時才執行 init_db，避免每次同步皆執行 DDL 導致 schema 鎖定與 Lock 衝突
    table_exists = target_conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='merchants'").fetchone()
    if not table_exists:
        init_db(target_conn)
        old_count = 0
    else:
        old_count = target_conn.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
    new_count = len({m["tax_id"] if m["tax_id"] is not None else (m["name"],m["address"] or "") for m in normalized_temp_merchants})
    if new_count == 0:
        target_conn.close()
        raise RuntimeError("Abort: incoming merchant dataset is empty")

    # 0. 安全閘門：筆數驟降 abort（避免壞解析清空生產資料）
    # 閾值由環境變數 MASS_DELETE_MIN_OLD / MASS_DELETE_RATIO 控制（即時讀，
    # 不用頂層快取值，容器啟動後改 env 重跑即生效）。
    # 空庫（old_count=0）不適用比例閘門，但新筆數也至少要有絕對下限，避免把空/壞庫洗上線。
    _min_old = env_number("MASS_DELETE_MIN_OLD", MASS_MIN_OLD, 1, 1_000_000, integer=True)
    _ratio = env_number("MASS_DELETE_RATIO", MASS_RATIO, 0.01, 1)
    if old_count > _min_old and new_count < old_count * _ratio:
        target_conn.close()
        raise RuntimeError(f"Abort: new={new_count} < {_ratio*100:.0f}% of old={old_count}, refuse mass delete")

    # 0. 同步前 timestamped 備份
    if table_exists:
        try:
            bak = backup_database(target_conn, target_db_path)
            log.info(f"💾 已備份同步前 DB → {bak}")
        except Exception:
            target_conn.close()
            log.exception("同步前備份失敗，中止更新")
            raise

    try:
        cursor = target_conn.cursor()
        cursor.execute("BEGIN IMMEDIATE")
        ensure_schema(target_conn)
        removed_favorites = 0

        # 0. 規範化 target_db 既有資料的 tax_id
        # 規範化既有 tax_id：Python 側 normalize_tax_id 清所有 \s（含 \t\n\r＋全形空白），
        # SQL 側同步清掉這些，避免兩側對不上誤判下架。清完若撞 UNIQUE（同稅號並存兩列），
        # 讓它在交易內報錯 ROLLBACK（下方 except），不靜默洗庫。
        cursor.execute(
            "UPDATE merchants SET tax_id = NULLIF(TRIM("
            "REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(tax_id, CHAR(12288), ''), ' ', ''), CHAR(9), ''), CHAR(10), ''), CHAR(13), '')"
            "), '');"
        )

        # 1. 有 tax_id 商家 UPSERT
        valid_tax_merchants = [m for m in normalized_temp_merchants if m["tax_id"] is not None]
        new_tax_ids = {m["tax_id"] for m in valid_tax_merchants}

        cursor.executemany("""
            INSERT INTO merchants (name, address, zip_code, tax_id, website, lat, lon,coord_source,coord_accuracy,geocoded_address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tax_id) DO UPDATE SET
                name = excluded.name,
                address = excluded.address,
                zip_code = excluded.zip_code,
                website = excluded.website,
                lat = CASE WHEN excluded.lat IS NOT NULL THEN excluded.lat
                    WHEN same_address(merchants.address, excluded.address) AND preservable_coordinates(merchants.lat,merchants.lon,merchants.address,merchants.geocoded_address) THEN merchants.lat END,
                lon = CASE WHEN excluded.lon IS NOT NULL THEN excluded.lon
                    WHEN same_address(merchants.address, excluded.address) AND preservable_coordinates(merchants.lat,merchants.lon,merchants.address,merchants.geocoded_address) THEN merchants.lon END,
                coord_source = CASE WHEN excluded.lat IS NOT NULL THEN excluded.coord_source
                    WHEN same_address(merchants.address, excluded.address) AND preservable_coordinates(merchants.lat,merchants.lon,merchants.address,merchants.geocoded_address) THEN COALESCE(merchants.coord_source,'legacy_unknown') END,
                coord_accuracy = CASE WHEN excluded.lat IS NOT NULL THEN excluded.coord_accuracy
                    WHEN same_address(merchants.address, excluded.address) AND preservable_coordinates(merchants.lat,merchants.lon,merchants.address,merchants.geocoded_address) THEN COALESCE(merchants.coord_accuracy,'unknown') END,
                geocoded_address = CASE WHEN excluded.lat IS NOT NULL THEN excluded.geocoded_address
                    WHEN same_address(merchants.address, excluded.address) AND preservable_coordinates(merchants.lat,merchants.lon,merchants.address,merchants.geocoded_address) THEN COALESCE(merchants.geocoded_address,merchants.address) END;
        """, [
            (m["name"], m["address"], m["zip_code"], m["tax_id"], m["website"], m["lat"], m["lon"],m["coord_source"],m["coord_accuracy"],m["geocoded_address"])
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
                    lat = CASE WHEN ? IS NOT NULL THEN ? WHEN preservable_coordinates(lat,lon,address,geocoded_address) THEN lat END,
                    lon = CASE WHEN ? IS NOT NULL THEN ? WHEN preservable_coordinates(lat,lon,address,geocoded_address) THEN lon END,
                    coord_source = CASE WHEN ? IS NOT NULL THEN ? WHEN preservable_coordinates(lat,lon,address,geocoded_address) THEN COALESCE(coord_source,'legacy_unknown') END,
                    coord_accuracy = CASE WHEN ? IS NOT NULL THEN ? WHEN preservable_coordinates(lat,lon,address,geocoded_address) THEN COALESCE(coord_accuracy,'unknown') END,
                    geocoded_address = CASE WHEN ? IS NOT NULL THEN ? WHEN preservable_coordinates(lat,lon,address,geocoded_address) THEN COALESCE(geocoded_address,address) END
                WHERE tax_id IS NULL AND name = ? AND COALESCE(address, '') = COALESCE(?, '')
            """, (m["zip_code"], m["website"], m["lat"], m["lat"], m["lon"], m["lon"],m["lat"],m["coord_source"],m["lat"],m["coord_accuracy"],m["lat"],m["geocoded_address"], m["name"], m["address"])).rowcount

            if updated == 0:
                cursor.execute("""
                    INSERT INTO merchants (name, address, zip_code, tax_id, website, lat, lon,coord_source,coord_accuracy,geocoded_address)
                    VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
                """, (m["name"], m["address"], m["zip_code"], m["website"], m["lat"], m["lon"],m["coord_source"],m["coord_accuracy"],m["geocoded_address"]))

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
        rebuild_search_index(target_conn)
        bump_dataset_version(target_conn)
        set_metadata(target_conn, "dataset_updated_at", datetime.now(TZ_TAIPEI).isoformat())

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
            record_check("failed", "download")
            notify("❌ 國旅卡更新中止（下載失敗）")
            sys.exit(1)

        # 2. 解壓
        if not extract_pdf(zip_path, pdf_path):
            log.error("❌ 更新中止（解壓失敗）")
            record_check("failed", "extract")
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
            try:
                with sqlite3.connect(DB_PATH, timeout=10) as conn:
                    migrate_database(conn)
            except Exception:
                log.exception("本地資料遷移失敗，中止檢查")
                record_check("failed", "migration")
                return 1
            log.info("✅ PDF 無變更，無需更新，結束")
            record_check("skipped_no_change")
            return

        log.info("🆕 偵測到新版 PDF，開始更新...")

        # 讀取舊的商家集合（用於統計，兩側皆 normalize_tax_id）
        old_tax_ids = set()
        if os.path.exists(DB_PATH):
            old_conn = None
            try:
                old_conn = sqlite3.connect(DB_PATH)
                old_conn.execute("PRAGMA foreign_keys = ON;")
                old_conn.execute("PRAGMA busy_timeout = 5000;")
                for row in old_conn.execute("SELECT tax_id FROM merchants WHERE tax_id IS NOT NULL"):
                    tid = normalize_tax_id(row[0])
                    if tid is not None:
                        old_tax_ids.add(tid)
            except Exception:
                pass
            finally:
                if old_conn:
                    old_conn.close()

        # 4. 解析 PDF → 暫存 DB
        new_count = parse_pdf_to_db(pdf_path, new_db)
        if new_count < 0:
            log.error("❌ 更新中止（PDF 解析失敗）")
            record_check("failed", "parse")
            notify("❌ 國旅卡更新中止（PDF 解析失敗）")
            sys.exit(1)
        if not validate_records(new_count):
            log.error("❌ 更新中止（解析筆數過少）")
            record_check("failed", f"too_few:{new_count}")
            notify(f"❌ 國旅卡更新中止（解析筆數過少：{new_count}）")
            sys.exit(1)

        # 讀取新的商家集合（用於統計，兩側皆 normalize_tax_id）
        new_tax_ids = set()
        tmp_conn = None
        try:
            tmp_conn = sqlite3.connect(new_db)
            tmp_conn.execute("PRAGMA foreign_keys = ON;")
            tmp_conn.execute("PRAGMA busy_timeout = 5000;")
            for row in tmp_conn.execute("SELECT tax_id FROM merchants WHERE tax_id IS NOT NULL"):
                tid = normalize_tax_id(row[0])
                if tid is not None:
                    new_tax_ids.add(tid)
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
            record_check("failed", "sync")
            notify(f"❌ 國旅卡更新中止（同步失敗）：{e}")
            sys.exit(1)
        log.info(f"✅ DB 已更新：{DB_PATH}")

        # 同步後以目標庫實際筆數為準（meta 說真話，不用解析筆數 new_count）
        try:
            target_conn = sqlite3.connect(DB_PATH)
            try:
                final_total = target_conn.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
            finally:
                target_conn.close()
        except Exception as e:
            log.warning(f"查目標筆數失敗，fallback new_count={new_count}: {e}")
            final_total = new_count


    # 8. 記錄 hash（原子寫入）
    atomic_write_text(HASH_FILE, new_hash)

    # 9. 寫入 metadata（原子寫入）
    end_time = datetime.now(TZ_TAIPEI)
    meta = {
        "last_updated": end_time.isoformat(),
        "pdf_hash": new_hash,
        "total_merchants": final_total,
        "new_merchants": added_count,
        "removed_merchants": removed_count,
        "removed_favorites": removed_favorites,
        "duration_seconds": round((end_time - start_time).total_seconds(), 1),
        "last_checked": end_time.isoformat(),
        "last_check_result": "updated",
        "last_successful_check": end_time.isoformat(),
    }
    atomic_write_text(META_FILE, json.dumps(meta, ensure_ascii=False, indent=2))

    log.info("=" * 60)
    log.info(f"🎉 更新完成！耗時 {meta['duration_seconds']} 秒")
    log.info(f"   商家總數：{final_total:,}（新增 {added_count:,} 筆，移除 {removed_count:,} 筆）")
    log.info("=" * 60)


if __name__ == "__main__":
    sys.exit(main() or 0)
