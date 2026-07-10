from backend.routers.merchants import parse_search_query

def test_parse_search_query_empty():
    assert parse_search_query("") == (None, [])
    assert parse_search_query(None) == (None, [])

def test_parse_search_query_short_terms():
    # 2字詞會被歸類在 LIKE
    assert parse_search_query("台北 咖啡") == (None, ["台北", "咖啡"])

def test_parse_search_query_long_terms():
    # 3字及以上詞會被歸類在 FTS
    assert parse_search_query("大飯店 義大利麵") == ('"大飯店" AND "義大利麵"', [])

def test_parse_search_query_mixed_terms():
    # 混合詞分流
    assert parse_search_query("台北 大飯店 咖啡") == ('"大飯店"', ["台北", "咖啡"])

def test_parse_search_query_escape_quotes():
    # 逸出雙引號防注入/報錯
    assert parse_search_query('路易"莎 咖啡') == ('"路易""莎"', ["咖啡"])

def test_parse_search_query_deduplication():
    # 測試重複詞彙去重
    assert parse_search_query("台北 咖啡店 台北 咖啡店") == ('"咖啡店"', ["台北"])


def test_parse_search_query_extreme_inputs():
    # 測試純空白或垃圾字元
    assert parse_search_query("   ") == (None, [])
    assert parse_search_query("  \t\n  ") == (None, [])
    # 測試全特殊字元
    assert parse_search_query("!@# $%^") == (None, [])


