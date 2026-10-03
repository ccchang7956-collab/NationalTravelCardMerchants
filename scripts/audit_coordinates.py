"""Read-only coordinate audit. Suspicions are reported for review, never erased."""
import argparse
import csv
import math
import os
from pathlib import Path
import sqlite3
import sys

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0,str(PROJECT_ROOT))
from shared.coordinates import same_address, valid_coordinates
from shared.postal import TAIWAN_ZIPCODES


def audit(conn):
    conn.row_factory = sqlite3.Row
    columns = {row[1] for row in conn.execute("PRAGMA table_info(merchants)")}
    for row in conn.execute("SELECT * FROM merchants"):
        if row["lat"] is None and row["lon"] is None:
            continue
        source = row["coord_source"] if "coord_source" in columns else None
        located_address = row["geocoded_address"] if "geocoded_address" in columns else None
        reasons = []
        if not valid_coordinates(row["lat"],row["lon"]):
            reasons.append("invalid_coordinate_pair")
        elif located_address and not same_address(located_address,row["address"]):
            reasons.append("address_changed")
        else:
            postal = TAIWAN_ZIPCODES.get(str(row["zip_code"] or "")[:3])
            if postal:
                distance = math.hypot((row["lat"]-postal[0])*111,(row["lon"]-postal[1])*111*math.cos(math.radians(postal[0])))
                if distance > max(20,postal[2]*4):
                    reasons.append("far_from_postal_center")
        if not source or source == "legacy_unknown":
            reasons.append("legacy_unknown")
        if reasons:
            yield (row["id"],row["tax_id"],row["name"],row["address"],row["lat"],row["lon"],";".join(reasons))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db",default=os.environ.get("DB_PATH",str(PROJECT_ROOT/"backend/merchants.db")))
    arguments = parser.parse_args()
    conn = sqlite3.connect(Path(arguments.db).resolve().as_uri()+"?mode=ro",uri=True)
    try:
        writer = csv.writer(sys.stdout)
        writer.writerow(("id","tax_id","name","address","lat","lon","reason"))
        writer.writerows(audit(conn))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
