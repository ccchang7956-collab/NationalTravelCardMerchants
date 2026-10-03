"""Fill missing locations with stable postal estimates; preserve existing geocodes."""
import argparse
import os
from pathlib import Path
import sqlite3
import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0,str(PROJECT_ROOT))
from backend.database import init_db
from scheduler.update_data import fill_missing_coords
from shared.postal import TAIWAN_ZIPCODES, zipcode_coords
from shared.backups import backup_database
from shared.locking import database_lock

DB_PATH = os.environ.get("DB_PATH",str(PROJECT_ROOT / "backend/merchants.db"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db",default=DB_PATH)
    arguments = parser.parse_args()
    with database_lock(arguments.db):
        conn = sqlite3.connect(Path(arguments.db).resolve().as_uri()+"?mode=rw",uri=True)
        try:
            init_db(conn)
            backup_database(conn,arguments.db)
        finally:
            conn.close()
        print(f"Filled {fill_missing_coords(arguments.db)} postal estimates")


if __name__ == "__main__":
    main()
