from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import sqlite3

from backend.routers import merchants
from backend.database import DB_PATH, get_db_connection

app = FastAPI(
    title="National Travel Card Merchants API",
    description="API for querying National Travel Card authorized stores in Taiwan",
    version="1.0.0"
)

# CORS 設定：從環境變數讀取允許的來源，支援多個（逗號分隔）
_cors_origins_env = os.environ.get("CORS_ORIGINS", "http://localhost:3000")
CORS_ORIGINS = [o.strip() for o in _cors_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(merchants.router, prefix="/api", tags=["merchants"])

@app.get("/")
def root():
    db_exists = os.path.exists(DB_PATH)
    return {
        "message": "Welcome to National Travel Card Merchants API",
        "database_ready": db_exists,
        "docs_url": "/docs"
    }

@app.get("/api/data-info")
def data_info():
    """回傳資料最後更新時間、商家總數、PDF hash 等元資訊"""
    # 讀取 scheduler 寫入的 metadata 檔案
    meta_path = os.path.join(os.path.dirname(DB_PATH), "update_meta.json")
    meta = {}
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            meta = {}

    # 從 DB 直接讀取最新商家數量（當作 fallback）
    total_merchants = 0
    if os.path.exists(DB_PATH):
        conn = None
        try:
            conn = get_db_connection()
            total_merchants = conn.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]
        except Exception:
            total_merchants = 0
        finally:
            if conn:
                conn.close()

    return {
        "database_ready": os.path.exists(DB_PATH),
        "total_merchants": meta.get("total_merchants", total_merchants),
        "last_updated": meta.get("last_updated"),
        "pdf_hash": meta.get("pdf_hash"),
        "new_merchants": meta.get("new_merchants"),
        "removed_merchants": meta.get("removed_merchants"),
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
