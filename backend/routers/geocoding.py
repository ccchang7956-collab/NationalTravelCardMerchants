"""Explicit address searches with a shared, persistent cache and upstream budget."""
import json
import math
import os
from pathlib import Path
import sqlite3
import time

from fastapi import APIRouter, HTTPException, Query
import requests

from backend.database import DB_PATH

router = APIRouter()
CACHE_TTL = 7 * 86400
MAX_CACHE_ENTRIES = 1000


def search_address(query: str) -> list[dict]:
    provider = os.getenv("ADDRESS_SEARCH_URL", "https://nominatim.openstreetmap.org/search")
    user_agent = os.getenv("ADDRESS_SEARCH_USER_AGENT", "NationalTravelCardMerchants/1.0 (+https://ntc.shibaalin.com)")
    cache_path = os.getenv("ADDRESS_SEARCH_CACHE_PATH", str(Path(DB_PATH).with_name("address_search.db")))
    key = json.dumps([provider, " ".join(query.split())], ensure_ascii=False)
    try:
        conn = sqlite3.connect(cache_path, timeout=0.2)
    except sqlite3.Error as exc:
        raise HTTPException(503, "地址搜尋暫時不可用") from exc
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS searches (key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at REAL NOT NULL)")
        conn.execute("CREATE TABLE IF NOT EXISTS upstream_budget (id INTEGER PRIMARY KEY CHECK(id=1), last_attempt REAL NOT NULL)")
        # A SQLite transaction serializes reservations across threads and workers.
        conn.execute("BEGIN IMMEDIATE")
        now = time.time()
        cached = conn.execute("SELECT payload FROM searches WHERE key=? AND fetched_at>?", (key, now - CACHE_TTL)).fetchone()
        if cached:
            conn.commit()
            return json.loads(cached[0])
        last = conn.execute("SELECT last_attempt FROM upstream_budget WHERE id=1").fetchone()
        if last and now - last[0] < 1.1:
            retry_after = max(2, math.ceil(1.1 - (now - last[0])))
            raise HTTPException(429, "地址搜尋忙碌中，請稍後再試", headers={"Retry-After": str(retry_after)})
        conn.execute("INSERT OR REPLACE INTO upstream_budget VALUES (1, ?)", (now,))
        conn.commit()

        try:
            upstream = requests.get(
                provider,
                params={"format": "json", "q": query, "countrycodes": "tw", "limit": 5},
                headers={"User-Agent": user_agent, "Accept-Language": "zh-TW,zh;q=0.9"},
                timeout=(3, 8),
                allow_redirects=False,
            )
            if upstream.status_code == 429:
                # Respect the provider cooldown across all backend workers.
                try:
                    cooldown = max(60, min(3600, int(upstream.headers.get("Retry-After", "60"))))
                except (ValueError, TypeError):
                    cooldown = 60
                conn.execute("UPDATE upstream_budget SET last_attempt=MAX(last_attempt, ?) WHERE id=1", (time.time() + cooldown,))
                conn.commit()
                raise HTTPException(429, "地址搜尋服務忙碌中，請稍後再試", headers={"Retry-After": str(cooldown)})
            if upstream.status_code != 200:
                raise HTTPException(502, "地址搜尋服務暫時不可用")
            raw = upstream.json()
            if not isinstance(raw, list):
                raise ValueError("Invalid geocoder response")
            results = []
            for item in raw[:5]:
                lat, lon = float(item["lat"]), float(item["lon"])
                name = item["display_name"]
                if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
                    raise ValueError("Invalid coordinates")
                if not isinstance(name, str) or not name:
                    raise ValueError("Invalid address")
                results.append({"place_id": int(item["place_id"]), "lat": str(lat), "lon": str(lon), "display_name": name})
        except (requests.RequestException, ValueError, KeyError, TypeError, OverflowError) as exc:
            raise HTTPException(502, "地址搜尋服務暫時不可用") from exc

        conn.execute("BEGIN IMMEDIATE")
        conn.execute("INSERT OR REPLACE INTO searches VALUES (?, ?, ?)", (key, json.dumps(results, ensure_ascii=False), time.time()))
        conn.execute("DELETE FROM searches WHERE fetched_at <= ?", (time.time() - CACHE_TTL,))
        conn.execute("DELETE FROM searches WHERE key IN (SELECT key FROM searches ORDER BY fetched_at DESC, key LIMIT -1 OFFSET ?)", (MAX_CACHE_ENTRIES,))
        conn.commit()
        return results
    except sqlite3.Error as exc:
        raise HTTPException(503, "地址搜尋暫時忙碌，請稍後再試") from exc
    finally:
        conn.close()


@router.get("/geocoding/search")
def geocode(q: str = Query(..., min_length=2, max_length=200)):
    query = " ".join(q.split())
    if len(query) < 2:
        raise HTTPException(422, "請輸入至少兩個字的地址")
    return search_address(query)
