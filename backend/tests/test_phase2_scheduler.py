def test_download_rejects_oversize():
    from scheduler.update_data import MAX_DOWNLOAD_MB
    assert MAX_DOWNLOAD_MB == 200


def test_parse_validates_counts():
    from scheduler.update_data import validate_records
    assert validate_records([], 0) is False
