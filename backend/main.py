from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

from backend.routers import merchants
from backend.database import DB_PATH

app = FastAPI(
    title="National Travel Card Merchants API",
    description="API for querying National Travel Card authorized stores in Taiwan",
    version="1.0.0"
)

# CORS configuration for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"], # Next.js default port
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

if __name__ == "__main__":
    import uvicorn
    # Make sure to run from project root: python -m backend.main
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
