"""Compact, version-consistent exports for request-time sitemap generation."""
import json
from pathlib import Path
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query
from backend.database import get_db
from shared.schema import metadata_value

router = APIRouter()
SHARD_SIZE = 10_000
BATCH_SIZE = 5_000
_manifest_cache = {}


def dataset_version(conn):
    version = metadata_value(conn, "dataset_version")
    if not version:
        raise HTTPException(503, "Dataset is not initialized")
    return version


@router.get("/sitemaps/manifest")
def manifest(db: sqlite3.Connection = Depends(get_db)):
    try:
        db.execute("BEGIN")
        version = dataset_version(db)
        path = db.execute("PRAGMA database_list").fetchone()[2]
        cached = _manifest_cache.get(path)
        if cached and cached["version"] == version:
            return cached
        rows = db.execute("""
            WITH ordered AS (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS position FROM merchants)
            SELECT (position - 1) / ? AS shard, MIN(id), MAX(id), COUNT(*)
            FROM ordered GROUP BY shard ORDER BY shard
        """, (SHARD_SIZE,)).fetchall()
        last_updated = metadata_value(db, "dataset_updated_at")
        if not last_updated and path:
            try:
                meta = json.loads((Path(path).parent / "update_meta.json").read_text())
                last_updated = meta.get("last_updated") if isinstance(meta, dict) else None
            except (OSError, ValueError):
                pass
        result = {"version": version, "total": sum(row[3] for row in rows), "shard_size": SHARD_SIZE,
                  "last_updated": last_updated,
                  "shards": [{"id": row[0], "min_id": row[1], "max_id": row[2], "count": row[3]} for row in rows]}
        _manifest_cache[path] = result
        return result
    except sqlite3.DatabaseError as error:
        raise HTTPException(503, "Sitemap data unavailable") from error
    finally:
        db.rollback()


@router.get("/sitemaps/merchants")
def merchant_batch(
    version: str = Query(..., min_length=32, max_length=32),
    min_id: int = Query(..., ge=1, le=9223372036854775807),
    max_id: int = Query(..., ge=1, le=9223372036854775807),
    after_id: int = Query(0, ge=0, le=9223372036854775807),
    limit: int = Query(BATCH_SIZE, ge=1, le=BATCH_SIZE),
    db: sqlite3.Connection = Depends(get_db),
):
    if max_id < min_id:
        raise HTTPException(400, "Invalid ID bounds")
    try:
        db.execute("BEGIN")
        current = dataset_version(db)
        if current != version:
            raise HTTPException(409, "Dataset changed; reload manifest")
        rows = db.execute("SELECT id,tax_id FROM merchants WHERE id>=? AND id<=? AND id>? ORDER BY id LIMIT ?",
                          (min_id, max_id, after_id, limit)).fetchall()
        cursor = rows[-1][0] if rows and rows[-1][0] < max_id else None
        return {"version": current, "items": [{"id": row[0], "tax_id": row[1]} for row in rows], "next_cursor": cursor}
    except sqlite3.DatabaseError as error:
        raise HTTPException(503, "Sitemap data unavailable") from error
    finally:
        db.rollback()
