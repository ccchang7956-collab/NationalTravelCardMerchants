def test_scheduler_bundles_backend_database():
    import pathlib
    repo_root = pathlib.Path(__file__).resolve().parents[2]
    dockerfile = (repo_root / "scheduler/Dockerfile").read_text()
    assert "COPY backend/database.py" in dockerfile
    assert "vendor_backend_database" in dockerfile
    src = (repo_root / "scheduler/update_data.py").read_text()
    # 容器內無 backend 包：必須有 vendored fallback（try backend / except ModuleNotFoundError）
    assert "vendor_backend_database" in src
    assert "from backend.database import" in src
    assert "ModuleNotFoundError" in src
