import sqlite3
import pytest
from backend.routers.merchants import space_segment, parse_search_query
from backend.database import DB_PATH

def test_space_segment():
    # 測試中文與英數分詞
    assert space_segment("臺北市中正區") == "臺 北 市 中 正 區"
    assert space_segment("CHIC古亭店") == "CHIC 古 亭 店"
    assert space_segment("7-11便利店") == "7 11 便 利 店"

def test_parse_search_query():
    # 測試搜尋字詞轉換為 FTS5 查詢語法
    assert parse_search_query("台北 咖啡") == '"台 北" AND "咖 啡"'
    assert parse_search_query("7-11") == '"7 11"'
    assert parse_search_query("CHIC古亭") == '"CHIC 古 亭"'

def test_fts_match_correctness():
    # 使用記憶體資料庫進行完全密封的測試
    conn = sqlite3.connect(":memory:")
    cursor = conn.cursor()
    
    # 建立表與 FTS5 虛擬表
    cursor.execute("""
        CREATE TABLE merchants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT
        )
    """)
    cursor.execute("""
        CREATE VIRTUAL TABLE merchants_fts USING fts5(
            name,
            address,
            tokenize="unicode61"
        )
    """)
    
    # 插入測試資料
    test_data = [
        ("台北大飯店", "台北市中正區"),
        ("台北小樽咖啡", "台北市大安區"),
        ("台中咖啡廳", "台中市西區"),
        ("台南大飯店", "台南市中西區")
    ]
    for name, address in test_data:
        cursor.execute("INSERT INTO merchants (name, address) VALUES (?, ?)", (name, address))
        rowid = cursor.lastrowid
        cursor.execute("INSERT INTO merchants_fts (rowid, name, address) VALUES (?, ?, ?)", 
                       (rowid, space_segment(name), space_segment(address)))
    conn.commit()
    
    # 測試短中文搜尋 "台北"
    fts_q = parse_search_query("台北")
    cursor.execute("SELECT COUNT(*) FROM merchants m JOIN merchants_fts f ON m.id = f.rowid WHERE f.merchants_fts MATCH ?", (fts_q,))
    assert cursor.fetchone()[0] == 2  # 台北大飯店、台北小樽咖啡
    
    # 測試多重條件 "台北 咖啡"
    fts_q_mixed = parse_search_query("台北 咖啡")
    cursor.execute("SELECT COUNT(*) FROM merchants m JOIN merchants_fts f ON m.id = f.rowid WHERE f.merchants_fts MATCH ?", (fts_q_mixed,))
    assert cursor.fetchone()[0] == 1  # 台北小樽咖啡
    
    conn.close()
