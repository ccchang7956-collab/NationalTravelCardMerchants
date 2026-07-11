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
    # 驗證 FTS MATCH 與 LIKE 的回傳結果基本一致
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    keyword = "咖啡"
    # LIKE 查詢數量
    cursor.execute("SELECT COUNT(*) FROM merchants WHERE name LIKE ? OR address LIKE ?", (f"%{keyword}%", f"%{keyword}%"))
    like_count = cursor.fetchone()[0]
    
    # FTS MATCH 查詢數量
    fts_q = parse_search_query(keyword)
    cursor.execute("SELECT COUNT(*) FROM merchants m JOIN merchants_fts f ON m.id = f.rowid WHERE f.merchants_fts MATCH ?", (fts_q,))
    fts_count = cursor.fetchone()[0]
    
    # 允許少量由於「台/臺」正規化產生的預期差異，但應該非常接近
    assert abs(like_count - fts_count) < 20
    conn.close()
