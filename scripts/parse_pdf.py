"""Import a local PDF through the same safe transaction as the daily scheduler."""
import argparse
import os
from pathlib import Path
import sys
import tempfile

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from scheduler.update_data import (
    fill_missing_coords, migrate_coords, migrate_industries,
    parse_pdf_to_db, transactional_sync_db, validate_records,
)
from shared.search import normalize_text, space_segment

DB_PATH = os.environ.get("DB_PATH", str(PROJECT_ROOT / "backend/merchants.db"))
PDF_PATH = str(PROJECT_ROOT / "docs/QualifiedRetailerList.pdf")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", default=PDF_PATH)
    parser.add_argument("--db", default=DB_PATH)
    arguments = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="ntc-import-") as directory:
        incoming = str(Path(directory) / "incoming.db")
        count = parse_pdf_to_db(arguments.pdf, incoming)
        if not validate_records(count):
            raise RuntimeError(f"Refusing incomplete import: {count} rows")
        migrate_coords(arguments.db, incoming)
        migrate_industries(arguments.db, incoming)
        fill_missing_coords(incoming)
        transactional_sync_db(incoming, arguments.db)
    print(f"Imported {count} merchants into {arguments.db}")


if __name__ == "__main__":
    main()
