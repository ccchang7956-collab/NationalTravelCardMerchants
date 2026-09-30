def test_download_rejects_oversize():
    from scheduler.update_data import MAX_DOWNLOAD_MB
    assert MAX_DOWNLOAD_MB == 200


def test_parse_validates_counts():
    from scheduler.update_data import validate_records
    assert validate_records([], 0) is False


def test_notify_has_no_module_level_cached_url():
    import scheduler.update_data as ud
    assert not hasattr(ud, "NOTIFY_URL")


def test_notify_reads_webhook_env_live(monkeypatch):
    import scheduler.update_data as ud
    monkeypatch.setenv("NOTIFY_WEBHOOK_URL", "http://example.com/hook")
    calls = []
    monkeypatch.setattr(
        ud.requests, "post", lambda *a, **k: calls.append((a, k))
    )
    ud.notify("hello")
    assert len(calls) == 1
    assert calls[0][0][0] == "http://example.com/hook"


def test_notify_noop_without_webhook_env(monkeypatch):
    import scheduler.update_data as ud
    monkeypatch.delenv("NOTIFY_WEBHOOK_URL", raising=False)
    called = []
    monkeypatch.setattr(
        ud.requests, "post", lambda *a, **k: called.append(1)
    )
    ud.notify("hello")
    assert called == []
