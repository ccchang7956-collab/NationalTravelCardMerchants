#!/usr/bin/env python3
import os
import sys
import time
import sqlite3

# 取得 DB 路徑
backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
DB_PATH = os.path.join(backend_dir, "merchants.db")

def get_visual_width(s):
    width = 0
    for char in s:
        if ord(char) > 127:
            width += 2
        else:
            width += 1
    return width

def pad_string(s, length, align="left"):
    w = get_visual_width(s)
    pad = max(0, length - w)
    if align == "left":
        return s + " " * pad
    else:
        return " " * pad + s

def migrate_database():
    print(f"📦 連線至資料庫 {DB_PATH} ...")
    if not os.path.exists(DB_PATH):
        print("❌ 找不到資料庫檔案，請確認路徑或先執行排程腳本生成資料庫。")
        sys.exit(1)
        
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA busy_timeout = 5000;")
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        cursor = conn.cursor()
        print("🛠️  建立 FTS5 虛擬表...")
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS merchants_fts USING fts5(
                name,
                address,
                content='merchants',
                content_rowid='id',
                tokenize='trigram'
            );
        """)
        print("🛠️  建立經緯度聯合索引...")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_lat_lon ON merchants(lat, lon);")
        print("⚡ 重建 FTS5 索引...")
        cursor.execute("INSERT INTO merchants_fts(merchants_fts) VALUES('rebuild');")
        conn.commit()
        print("✅ 資料庫遷移與索引重建成功！")
    except Exception as e:
        if conn:
            conn.rollback()
        print(f"❌ 遷移失敗: {e}")
        sys.exit(1)
    finally:
        if conn:
            conn.close()

def benchmark_queries():
    conn = None
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA busy_timeout = 5000;")
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        # 測試詞彙
        test_cases = [
            ("大飯店", "3字長詞"),
            ("咖啡廳", "3字長詞"),
            ("7-11", "4字英文/數字"),
            ("台北", "2字短詞"),
            ("台中", "2字短詞"),
            ("台北 大飯店", "混合字詞"),
            ("", "空關鍵字")
        ]
        
        print("\n⏱️  開始搜尋效能基準測試 (每個關鍵字執行 50 次取平均時間)...")
        print("-" * 85)
        print(f"{pad_string('關鍵字', 15)} | {pad_string('類型', 15)} | {'LIKE 平均時長':<14} | {'FTS5 混合平均':<14} | {'加速倍數':<8}")
        print("-" * 85)
        
        for q, qtype in test_cases:
            # --- 1. 舊版 LIKE 搜尋模擬 ---
            terms = q.split()
            like_where = []
            like_params = []
            for t in terms:
                safe_t = t.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                like_where.append("(name LIKE ? ESCAPE '\\' OR address LIKE ? ESCAPE '\\')")
                like_params.extend([f"%{safe_t}%", f"%{safe_t}%"])
            
            if like_where:
                like_sql = f"SELECT COUNT(*) FROM merchants WHERE {' AND '.join(like_where)}"
            else:
                like_sql = "SELECT COUNT(*) FROM merchants WHERE 1=1"
            
            t0 = time.time()
            for _ in range(50):
                conn.execute(like_sql, like_params).fetchone()
            t_like = ((time.time() - t0) / 50) * 1000  # ms
            
            # --- 2. 新版 FTS5 混合搜尋模擬 ---
            # 採用 parse_search_query 的分流邏輯
            fts_parts = []
            like_terms = []
            for t in terms:
                if len(t) >= 3:
                    fts_parts.append(f'"{t.replace(chr(34), chr(34)+chr(34))}"')
                else:
                    like_terms.append(t)
                    
            fts_query = " AND ".join(fts_parts) if fts_parts else None
            
            fts_where = []
            fts_params = []
            fts_sql = ""
            
            if fts_query:
                fts_sql = "SELECT COUNT(*) FROM merchants m JOIN merchants_fts f ON m.id = f.rowid WHERE f.merchants_fts MATCH ?"
                fts_params.append(fts_query)
                for t in like_terms:
                    safe_t = t.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                    fts_where.append("(m.name LIKE ? ESCAPE '\\' OR m.address LIKE ? ESCAPE '\\')")
                    fts_params.extend([f"%{safe_t}%", f"%{safe_t}%"])
                if fts_where:
                    fts_sql += f" AND {' AND '.join(fts_where)}"
            else:
                if like_where:
                    fts_sql = f"SELECT COUNT(*) FROM merchants WHERE {' AND '.join(like_where)}"
                else:
                    fts_sql = "SELECT COUNT(*) FROM merchants WHERE 1=1"
                fts_params = like_params

            t0 = time.time()
            for _ in range(50):
                conn.execute(fts_sql, fts_params).fetchone()
            t_fts = ((time.time() - t0) / 50) * 1000  # ms
            
            ratio = t_like / t_fts if t_fts > 0 else 1.0
            
            col_q = pad_string(q, 15)
            col_type = pad_string(qtype, 15)
            print(f"{col_q} | {col_type} | {t_like:12.3f} ms | {t_fts:12.3f} ms | {ratio:6.1f}x")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    migrate_database()
    benchmark_queries()
