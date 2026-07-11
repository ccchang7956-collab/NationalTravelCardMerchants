from backend.routers.merchants import parse_search_query

def test_parse_search_query_empty():
    assert parse_search_query("") is None
    assert parse_search_query(None) is None

def test_parse_search_query_short_terms():
    assert parse_search_query("台北 咖啡") == '"台 北" AND "咖 啡"'

def test_parse_search_query_long_terms():
    assert parse_search_query("大飯店 義大利麵") == '"大 飯 店" AND "義 大 利 麵"'

def test_parse_search_query_mixed_terms():
    assert parse_search_query("台北 大飯店 咖啡") == '"台 北" AND "大 飯 店" AND "咖 啡"'

def test_parse_search_query_escape_quotes():
    assert parse_search_query('路易"莎 咖啡') == '"路 易 莎" AND "咖 啡"'

def test_parse_search_query_deduplication():
    assert parse_search_query("台北 咖啡 台北 咖啡") == '"台 北" AND "咖 啡"'

def test_parse_search_query_extreme_inputs():
    assert parse_search_query("   ") is None
    assert parse_search_query("  \t\n  ") is None
    assert parse_search_query("!@# $%^") is None
    assert parse_search_query('"') is None
    assert parse_search_query('"""') is None

def test_parse_search_query_safe_chars():
    assert parse_search_query("7-11 咖啡") == '"7 11" AND "咖 啡"'
    assert parse_search_query("A&B 義大利") == '"A B" AND "義 大 利"'
    assert parse_search_query("2+2=4") == '"2 2 4"'
