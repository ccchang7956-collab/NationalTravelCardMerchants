"""Task3 scheduler/shared fixes (TDD RED)."""
from shared.coordinates import valid_coordinates
from shared.search import parse_search_query


def test_valid_coordinates_rejects_null_island():
    assert valid_coordinates(0, 0) is False
    assert valid_coordinates(25.0339, 121.5645) is True


def test_parse_search_query_caps_terms():
    long_q = " ".join([f"詞{i}" for i in range(50)])
    parsed = parse_search_query(long_q)
    assert parsed is not None
    # 最多 10 個短語
    assert parsed.count(" AND ") + 1 <= 10
    assert len("a" * 500) > 0  # placeholder
    capped = parse_search_query("x" * 500)
    assert capped is None or len(capped) <= 1200
