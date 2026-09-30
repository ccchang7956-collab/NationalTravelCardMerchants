def test_scheduler_bundles_backend_database():
    import pathlib
    dockerfile = pathlib.Path("scheduler/Dockerfile").read_text()
    assert "backend/database.py" in dockerfile or "backend" in dockerfile
    src = pathlib.Path("scheduler/update_data.py").read_text()
    # 不允許裸 from backend.database import（容器內無 backend 包）
    assert "from backend.database import" not in src or "COPY backend" in dockerfile
