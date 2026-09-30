"""Pytest bootstrap: provide a test-only JWT secret.

Production guard in backend/auth_utils.py raises RuntimeError when
JWT_SECRET_KEY is unset. Tests run with an explicit non-production
secret so the suite can import the app; productionmotion without the
env var still fails fast at import time.
"""
import os

os.environ.setdefault("JWT_SECRET_KEY", "test-only-secret-key-do-not-use-in-prod")
