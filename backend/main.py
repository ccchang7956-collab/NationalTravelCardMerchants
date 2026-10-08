from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import os
import json
import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path
from shared.config import env_number

from backend.routers import merchants, sitemaps, geocoding
from backend.database import DB_PATH, get_db_connection, init_db


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(
    title="National Travel Card Merchants API",
    description="API for querying National Travel Card authorized stores in Taiwan",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS 設定：從環境變數讀取允許的來源，支援多個（逗號分隔）
_cors_origins_env = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
CORS_ORIGINS = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]

if "*" in CORS_ORIGINS:
    raise RuntimeError("CORS_ORIGINS=* with credentials is forbidden")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["X-Total-Count", "X-Has-More"],
)

# 防 Host header 污染：僅允許本站 + 本地 + docker 內網服務名（healthcheck 用）
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["ntc.shibaalin.com", "localhost", "127.0.0.1", "backend", "frontend", "testserver", "*.localhost"],
)

app.include_router(merchants.router, prefix="/api", tags=["merchants"])
app.include_router(sitemaps.router, prefix="/api", tags=["sitemaps"])
app.include_router(geocoding.router, prefix="/api", tags=["geocoding"])

@app.get("/")
def root():
    db_exists, _ = _probe_database()
    return {
        "message": "Welcome to National Travel Card Merchants API",
        "database_ready": db_exists,
        "docs_url": "/docs"
    }

STALE_AFTER_HOURS = env_number("DATA_STALE_AFTER_HOURS", 48.0, 0.1, 8760)
_TAIPEI_TZ = timezone(timedelta(hours=8))

def _read_update_meta() -> dict:
    meta_path = os.path.join(os.path.dirname(DB_PATH), "update_meta.json")
    if not os.path.exists(meta_path):
        return {}
    try:
        with open(meta_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def _probe_database(count=False):
    conn = None
    try:
        uri = Path(DB_PATH).resolve().as_uri() + "?mode=ro"
        conn = sqlite3.connect(uri, uri=True, timeout=1)
        conn.execute("SELECT id,name,address,lat,lon FROM merchants LIMIT 1").fetchone()
        conn.execute("SELECT rowid FROM merchants_fts LIMIT 1").fetchone()
        total = conn.execute("SELECT COUNT(*) FROM merchants").fetchone()[0] if count else None
        return True, total
    except (sqlite3.DatabaseError, OSError):
        return False, None
    finally:
        if conn is not None:
            conn.close()


@app.get("/api/ready")
def ready():
    available, _ = _probe_database()
    return JSONResponse({"status": "ready" if available else "unavailable", "database_ready": available}, status_code=200 if available else 503)


@app.get("/api/health")
def health():
    """Readiness and last successful pipeline check are separate signals."""
    meta = _read_update_meta()
    last_updated = meta.get("last_updated")
    last_checked = meta.get("last_checked")
    result = meta.get("last_check_result")
    anchor = meta.get("last_successful_check")
    if not isinstance(anchor, str) or not anchor:
        anchor = last_checked if result in ("updated", "skipped_no_change") else last_updated
    age_hours = None
    stale = True
    if isinstance(anchor, str) and anchor:
        try:
            ts = datetime.fromisoformat(anchor)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=_TAIPEI_TZ)
            age_hours = (datetime.now(timezone.utc) - ts.astimezone(timezone.utc)).total_seconds() / 3600
            age_hours = round(age_hours, 2)
            stale = age_hours > STALE_AFTER_HOURS or age_hours < -1
        except (ValueError, TypeError, OverflowError):
            stale = True
    available, _ = _probe_database()
    status = "unavailable" if not available else "degraded" if result == "failed" else "stale" if stale else "ok"
    return JSONResponse({
        "status": status,
        "database_ready": available,
        "last_updated": last_updated,
        "last_checked": last_checked,
        "last_check_result": result,
        "last_check_note": meta.get("last_check_note"),
        "last_successful_check": anchor,
        "age_hours": age_hours,
        "stale": stale,
        "stale_after_hours": STALE_AFTER_HOURS,
    }, status_code=200 if status == "ok" else 503)

@app.get("/api/data-info")
def data_info():
    """回傳資料最後更新時間、商家總數、PDF hash 等元資訊"""
    meta = _read_update_meta()
    available, total_merchants = _probe_database(count=True)

    return {
        "database_ready": available,
        "total_merchants": total_merchants,
        "last_updated": meta.get("last_updated"),
        "last_checked": meta.get("last_checked"),
        "last_check_result": meta.get("last_check_result"),
        "last_successful_check": meta.get("last_successful_check"),
        "last_check_note": meta.get("last_check_note"),
        "pdf_hash": meta.get("pdf_hash"),
        "new_merchants": meta.get("new_merchants"),
        "removed_merchants": meta.get("removed_merchants"),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=os.environ.get("UVICORN_RELOAD", "false").lower() == "true")
