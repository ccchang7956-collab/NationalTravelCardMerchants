import time
import math
import sqlite3
import pytest
from backend.services.search_service import space_segment, parse_search_query
from backend.services.route_optimizer import optimize_route, haversine_distance, _extract_coord

# ============================================================================
# FTS SEARCH TESTS
# ============================================================================

def test_fts_chinese_query_parsing():
    """Verify Chinese query parsing for '台北', '美食', and combinations."""
    q1 = parse_search_query("台北")
    assert q1 == '"台北"'
    
    q2 = parse_search_query("美食")
    assert q2 == '"美食"'
    
    q3 = parse_search_query("台北 美食")
    assert q3 == '"台北" AND "美食"'
    
    q4 = parse_search_query("臺北　美食")  # Fullwidth space + '臺' -> '台'
    assert q4 == '"台北" AND "美食"'


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

def test_route_optimizer_n500_performance():
    """Verify optimize_route execution time for N=500 points is < 1.0s (target < 0.2s)."""
    # Generate 500 random valid waypoints in Taiwan bounding box
    points = [
        {"id": i, "name": f"Store {i}", "lat": 22.0 + (i * 0.002) % 3.0, "lon": 120.0 + (i * 0.003) % 2.0}
        for i in range(500)
    ]
    
    durations = []
    for _ in range(5):
        t0 = time.perf_counter()
        res = optimize_route(points.copy())
        t1 = time.perf_counter()
        durations.append(t1 - t0)
        assert len(res["points"]) == 500
        assert res["total_distance_km"] > 0
    
    avg_duration = sum(durations) / len(durations)
    max_duration = max(durations)
    
    print(f"\n[N=500 Benchmark] Avg duration: {avg_duration*1000:.2f} ms, Max: {max_duration*1000:.2f} ms")
    assert max_duration < 1.0, f"Max duration {max_duration:.4f}s exceeded 1.0s threshold!"
    assert avg_duration < 0.2, f"Average duration {avg_duration:.4f}s exceeded target 0.2s!"


def test_route_optimizer_n1000_stress():
    """Stress test optimize_route for N=1000 points."""
    points = [
        {"id": i, "lat": 25.0 + (i * 0.001) % 1.0, "lon": 121.0 + (i * 0.001) % 1.0}
        for i in range(1000)
    ]
    t0 = time.perf_counter()
    res = optimize_route(points)
    t1 = time.perf_counter()
    duration = t1 - t0
    
    print(f"\n[N=1000 Benchmark] Duration: {duration*1000:.2f} ms")
    assert len(res["points"]) == 1000
    assert duration < 1.0, f"N=1000 duration {duration:.4f}s exceeded 1.0s threshold!"


def test_route_optimizer_edge_cases():
    """Verify route_optimizer with empty, single, invalid, and boundary inputs."""
    # 1. Empty & invalid top-level inputs
    assert optimize_route([]) == {"points": [], "total_distance_km": 0.0}
    assert optimize_route(None) == {"points": [], "total_distance_km": 0.0}
    assert optimize_route("invalid") == {"points": [], "total_distance_km": 0.0}

    # 2. Single point
    single = [{"id": 1, "lat": 25.0, "lon": 121.0}]
    assert optimize_route(single) == {"points": single, "total_distance_km": 0.0}

    # 3. Two points
    two_pts = [
        {"id": 1, "lat": 25.0330, "lon": 121.5654},  # Taipei 101
        {"id": 2, "lat": 25.0478, "lon": 121.5170},  # Taipei Main Station
    ]
    res_two = optimize_route(two_pts)
    assert len(res_two["points"]) == 2
    assert 4.0 < res_two["total_distance_km"] < 6.0  # Approx ~5 km

    # 4. Missing/None lat/lon or lat=0.0
    zero_lat_pts = [
        {"id": 1, "lat": 0.0, "lon": 121.0},
        {"id": 2, "lat": 25.0, "lon": 0.0},
        {"id": 3, "lat": None, "lon": None},
        {"id": 4, "lat": "invalid", "lon": "string"},
    ]
    res_zero = optimize_route(zero_lat_pts)
    assert len(res_zero["points"]) == 4

    # 5. Non-dict items in list
    mixed_pts = [
        {"id": 1, "lat": 25.0, "lon": 121.0},
        None,
        "not_a_dict",
        12345,
        {"id": 2, "lat": 25.1, "lon": 121.1},
    ]
    res_mixed = optimize_route(mixed_pts)
    assert len(res_mixed["points"]) == 5

    # 6. NaN / Inf values
    nan_pts = [
        {"id": 1, "lat": float('nan'), "lon": 121.0},
        {"id": 2, "lat": 25.0, "lon": float('inf')},
    ]
    res_nan = optimize_route(nan_pts)
    assert len(res_nan["points"]) == 2
    assert res_nan["total_distance_km"] == 0.0
