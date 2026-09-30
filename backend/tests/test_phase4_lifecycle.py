"""Phase 4 Task 1: backend lifespan, reload default off, deps pinned."""
import pathlib

MAIN = pathlib.Path("backend/main.py")
REQ = pathlib.Path("backend/requirements.txt")


def test_no_import_side_effect():
    src = MAIN.read_text()
    assert "init_db()" not in src.split("lifespan")[0] or "lifespan" in src


def test_no_top_level_init_db_call():
    """import 期不得有頂層 init_db() 呼叫；建表只能在 lifespan 內。"""
    src = MAIN.read_text()
    assert "lifespan" in src, "main.py must define lifespan"
    pre = src.split("lifespan")[0]
    assert "\ninit_db()" not in pre and "init_db()\n" not in pre.split("def ")[0], \
        "top-level init_db() call still present"


def test_lifespan_wired():
    src = MAIN.read_text()
    assert "asynccontextmanager" in src
    assert "lifespan=lifespan" in src
    body = src.split("lifespan")[1]
    assert "init_db()" in body


def test_reload_defaults_off():
    src = MAIN.read_text()
    assert "UVICORN_RELOAD" in src
    assert "reload=True" not in src


def test_requirements_pinned():
    txt = REQ.read_text()
    assert "pyjwt>=" not in txt and "passlib[bcrypt]>=" not in txt and "bcrypt>=" not in txt
    assert "email-validator>=" not in txt
    for pin in ("pyjwt==", "passlib[bcrypt]==", "bcrypt==", "email-validator=="):
        assert pin in txt, f"missing pin: {pin}"
