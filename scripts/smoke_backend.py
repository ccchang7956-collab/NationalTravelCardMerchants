"""Disposable smoke server with failure injection; excluded from production images."""
import os
from pathlib import Path
import sys

sys.path.insert(0,str(Path(__file__).resolve().parent.parent))
if not os.environ.get("DB_PATH","").startswith("/tmp/"):
    raise RuntimeError("Smoke server requires a temporary DB_PATH")

from fastapi import Request
from fastapi.responses import JSONResponse
from backend.main import app

_fail_merchants = False


@app.post("/__smoke/fail")
async def control(request: Request):
    global _fail_merchants
    _fail_merchants = bool((await request.json()).get("merchants"))
    return {"ok":True}


@app.middleware("http")
async def simulate_failure(request: Request, call_next):
    if _fail_merchants and (request.url.path == "/api/merchants" or request.url.path.startswith("/api/merchants/")):
        return JSONResponse({"detail":"Simulated unavailability"},status_code=503)
    return await call_next(request)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app,host="127.0.0.1",port=int(os.environ.get("SMOKE_API_PORT","18000")))
