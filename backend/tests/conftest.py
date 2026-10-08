"""Isolate app startup and scheduler artifacts before test modules import them."""
import os
import tempfile
from pathlib import Path

import pytest

_test_directory = tempfile.TemporaryDirectory(prefix="ntc-pytest-")
os.environ["DB_PATH"] = str(Path(_test_directory.name) / "merchants.db")


@pytest.fixture(scope="session", autouse=True)
def initialize_isolated_database():
    from backend.database import init_db
    init_db()
    yield
    _test_directory.cleanup()
