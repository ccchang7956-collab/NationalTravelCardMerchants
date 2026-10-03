"""Geocode bounded, resumable batches. Every result is labeled as an estimate."""
import argparse
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
import time
from typing import Optional
import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0,str(PROJECT_ROOT))
from backend.database import init_db
from shared.backups import backup_database
from shared.coordinates import normalize_address, same_address, valid_coordinates
from shared.locking import database_lock
from shared.postal import zipcode_coords

DB_PATH = os.environ.get("DB_PATH",str(PROJECT_ROOT / "backend/merchants.db"))
CACHE_PATH = os.environ.get("GEOCODE_CACHE_PATH",str(PROJECT_ROOT / "scripts/geocode_cache.json"))
NOMINATIM_URL = os.environ.get("GEOCODER_URL","https://nominatim.openstreetmap.org/search")
USER_AGENT = os.environ.get("GEOCODER_USER_AGENT","NationalTravelCardMerchantsApp/1.0")


def load_cache():
    try:
        data = json.loads(Path(CACHE_PATH).read_text())
        return data if isinstance(data,dict) else {}
    except (OSError,ValueError):
        return {}


def save_cache(cache):
    path = Path(CACHE_PATH)
    path.parent.mkdir(parents=True,exist_ok=True)
    descriptor, staging = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(descriptor,"w") as output:
            json.dump(cache,output,ensure_ascii=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(staging,path)
    finally:
        if os.path.exists(staging):
            os.unlink(staging)


def clean_address(address):
    address = normalize_address(address)
    return re.sub(r"[（(][^）)]*[）)]", "", address)


def nominatim_geocode(address: str, session: requests.Session) -> Optional[tuple]:
    response = session.get(NOMINATIM_URL,params={"q":address+", Taiwan","format":"json","limit":1,"countrycodes":"tw"},headers={"User-Agent":USER_AGENT},timeout=10)
    response.raise_for_status()
    data = response.json()
    if data and valid_coordinates(data[0].get("lat"),data[0].get("lon")):
        return float(data[0]["lat"]),float(data[0]["lon"])
    return None


def fallback_coords(zip_code):
    return zipcode_coords(zip_code)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db",default=DB_PATH)
    parser.add_argument("--limit",type=int,default=50)
    parser.add_argument("--city")
    parser.add_argument("--dry-run",action="store_true")
    parser.add_argument("--upgrade-estimates",action="store_true")
    parser.add_argument("--refresh-cache",action="store_true")
    arguments = parser.parse_args()
    if arguments.limit < 1:
        parser.error("--limit must be positive")
    mode = "ro" if arguments.dry_run else "rw"
    conn = sqlite3.connect(Path(arguments.db).resolve().as_uri()+f"?mode={mode}",uri=True)
    conn.row_factory = sqlite3.Row
    conn.create_function("same_address",2,same_address)
    try:
        if not arguments.dry_run:
            with database_lock(arguments.db):
                init_db(conn)
                backup_database(conn,arguments.db)
        columns = {row[1] for row in conn.execute("PRAGMA table_info(merchants)")}
        where = "(lat IS NULL OR lon IS NULL)"
        if arguments.upgrade_estimates:
            where = "(coord_source IS NULL OR coord_source!='address_geocode')" if "coord_source" in columns else "1=1"
        parameters = []
        if arguments.city:
            where += " AND substr(address,1,length(?))=?"
            parameters.extend([arguments.city,arguments.city])
        rows = conn.execute(f"SELECT id,name,address,zip_code FROM merchants WHERE {where} ORDER BY id LIMIT ?",(*parameters,arguments.limit)).fetchall()
        cache = load_cache()
        with requests.Session() as session:
            for merchant in rows:
                address = clean_address(merchant["address"] or "")
                if arguments.dry_run:
                    print(f'{merchant["id"]}: {address}')
                    continue
                cached = cache.get(address)
                coords = None
                source = "address_geocode"
                if not arguments.refresh_cache and isinstance(cached,dict) and valid_coordinates(cached.get("lat"),cached.get("lon")):
                    coords = (cached["lat"],cached["lon"])
                    source = "address_geocode" if cached.get("query") else "legacy_unknown"
                elif address and (arguments.refresh_cache or address not in cache):
                    try:
                        coords = nominatim_geocode(address,session)
                        cache[address] = {"lat":coords[0],"lon":coords[1],"query":address} if coords else None
                    except requests.RequestException as error:
                        print(f'Geocoder unavailable for {merchant["id"]}: {type(error).__name__}')
                    finally:
                        time.sleep(1.1)
                if not coords:
                    coords = fallback_coords(merchant["zip_code"])
                    source = "postal_estimate"
                if coords:
                    with database_lock(arguments.db):
                        conn.execute("UPDATE merchants SET lat=?,lon=?,coord_source=?,coord_accuracy=?,geocoded_address=? WHERE id=? AND same_address(address,?)",(*coords,source,"unknown" if source=="legacy_unknown" else "estimated",merchant["address"],merchant["id"],merchant["address"]))
                        conn.commit()
                save_cache(cache)
        print(f"Processed {len(rows)} merchants")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
