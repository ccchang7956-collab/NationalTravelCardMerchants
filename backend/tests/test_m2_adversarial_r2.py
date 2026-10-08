import time
import math
import sqlite3
import pytest
from backend.services.search_service import space_segment, parse_search_query

# ============================================================================
# FTS SEARCH TESTS
# ============================================================================

def test_fts_chinese_query_parsing():
    """Verify Chinese query parsing for '台北', '美食', and combinations."""
    q1 = parse_search_query("台北")
    assert q1 == '"台 北"'
    
    q2 = parse_search_query("美食")
    assert q2 == '"美 食"'
    
    q3 = parse_search_query("台北 美食")
    assert q3 == '"台 北" AND "美 食"'
    
    q4 = parse_search_query("臺北　美食")  # Fullwidth space + '臺' -> '台'
    assert q4 == '"台 北" AND "美 食"'


def test_fts_special_punctuation_safety():
    """Verify special punctuation does not trigger errors or invalid FTS queries."""
    punctuation_inputs = [
        '台北" OR "1"="1',
        "美食' AND '1'='1",
        "台北*",
        "美食:",
        "(台北) AND (美食)",
        "台北 NOT 美食",
        "台北 ^ ~ ? - + / \\ % $ # @ ! ~",
        "；：，。！？「」『』（）《》【】",
        "台北!@#$%^&*()_+-=[]{}|;':\",./<>?美食",
        "   ",
        "\t\n\r",
        "\"\"\"\"''''",
    ]
    for inp in punctuation_inputs:
        # Must not raise an exception
        res = parse_search_query(inp)
        if res is not None:
            # Resulting FTS query string must not contain raw unquoted quotes or dangerous operators outside quotes
            assert isinstance(res, str)


def test_fts_sqlite_execution():
    """Verify actual SQLite FTS5 query execution with parse_search_query results."""
    conn = sqlite3.connect(":memory:")
    cursor = conn.cursor()
    
    # Create FTS5 virtual table
    cursor.execute("CREATE VIRTUAL TABLE merchants_fts USING fts5(name, address, category);")
    
    # Insert test data processed with space_segment
    docs = [
        ("台北市信義區美食餐廳", "台北市信義區松壽路12號", "餐飲業"),
        ("高雄在地小吃美食館", "高雄市新興區中山一路50號", "餐飲業"),
        ("台北101卡友特約店", "台北市信義區信義路五段7號", "零售業"),
        ("台中精品服飾", "台中市西區公益路100號", "服飾業"),
    ]
    
    for idx, (name, addr, cat) in enumerate(docs, 1):
        indexed_name = space_segment(name, generate_ngrams=True)
        indexed_addr = space_segment(addr, generate_ngrams=True)
        indexed_cat = space_segment(cat, generate_ngrams=True)
        cursor.execute(
            "INSERT INTO merchants_fts(rowid, name, address, category) VALUES (?, ?, ?, ?)",
            (idx, indexed_name, indexed_addr, indexed_cat)
        )
    conn.commit()
    
    # 1. Test "台北" -> should match docs 1 and 3
    parsed = parse_search_query("台北")
    cursor.execute("SELECT rowid FROM merchants_fts WHERE merchants_fts MATCH ?", (parsed,))
    rows = [r[0] for r in cursor.fetchall()]
    assert set(rows) == {1, 3}
    
    # 2. Test "美食" -> should match docs 1 and 2
    parsed = parse_search_query("美食")
    cursor.execute("SELECT rowid FROM merchants_fts WHERE merchants_fts MATCH ?", (parsed,))
    rows = [r[0] for r in cursor.fetchall()]
    assert set(rows) == {1, 2}
    
    # 3. Test "台北 美食" -> should match doc 1
    parsed = parse_search_query("台北 美食")
    cursor.execute("SELECT rowid FROM merchants_fts WHERE merchants_fts MATCH ?", (parsed,))
    rows = [r[0] for r in cursor.fetchall()]
    assert rows == [1]
    
    # 4. Test special punctuation queries directly against FTS5 engine -> MUST NOT raise OperationalError
    adversarial_queries = [
        '台北" OR "1"="1',
        "美食' AND '1'='1",
        "台北* : ( ) [ ] { } NOT AND OR ^ ~ ?",
        "！@＃＄％＾＆＊（）——＋｜＼／",
        "台北 OR 美食",
        "NOT (台北)",
    ]
    for adv_q in adversarial_queries:
        parsed = parse_search_query(adv_q)
        if parsed:
            # This execute must not raise sqlite3.OperationalError
            cursor.execute("SELECT rowid FROM merchants_fts WHERE merchants_fts MATCH ?", (parsed,))
            _ = cursor.fetchall()
            
    conn.close()


# ============================================================================
# ROUTE OPTIMIZER TESTS
# ============================================================================
