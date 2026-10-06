"""Sync official Ministry of Finance tax industry codes onto local merchants by tax ID."""

import argparse
import csv
import io
import os
import re
import sqlite3
import tempfile
import zipfile
from contextlib import contextmanager
from pathlib import Path

import requests

from shared.backups import backup_database
from shared.locking import database_lock

SOURCE_URL = "https://eip.fia.gov.tw/data/BGMOPEN1.zip"
MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024
# The official full snapshot has well over a million valid tax IDs. Keep a
# conservative floor so a syntactically valid but truncated ZIP cannot seed or
# replace production classifications.
MIN_SOURCE_ROWS = 500_000
MIN_EXISTING_COVERAGE = 0.75
MIN_COVERAGE_BASE = 1_000


def normalize_tax_id(value):
    if value is None:
        return None
    cleaned = re.sub(r"[\s\u3000]+", "", str(value))
    return cleaned or None


@contextmanager
def _open_csv(path, encoding):
    path = str(path)
    if zipfile.is_zipfile(path):
        with zipfile.ZipFile(path) as archive:
            csv_members = [name for name in archive.namelist() if name.lower().endswith(".csv")]
            if len(csv_members) != 1:
                raise ValueError("官方壓縮檔需包含唯一 CSV 檔")
            with archive.open(csv_members[0]) as raw:
                with io.TextIOWrapper(raw, encoding=encoding, newline="") as text:
                    yield csv.reader(text)
    else:
        with open(path, "r", encoding=encoding, newline="") as text:
            yield csv.reader(text)


def _parse_source(path, merchant_ids):
    last_decode_error = None
    for encoding in ("utf-8-sig", "cp950", "utf-8"):
        records = set()
        matched_tax_ids = set()
        source_rows = 0
        try:
            with _open_csv(path, encoding) as reader:
                header = next(reader, None)
                if not header:
                    raise ValueError("行業資料 CSV 沒有標題列")
                try:
                    tax_id_index = header.index("統一編號")
                    industry_columns = [
                        (header.index(code_column), header.index(name_column))
                        for code_column, name_column in (
                            ("行業代號", "名稱"),
                            ("行業代號1", "名稱1"),
                            ("行業代號2", "名稱2"),
                            ("行業代號3", "名稱3"),
                        )
                    ]
                except ValueError as exc:
                    raise ValueError("行業資料欄位與財政部稅籍 CSV 格式不符") from exc

                for row in reader:
                    if len(row) <= tax_id_index:
                        continue
                    tax_id = normalize_tax_id(row[tax_id_index])
                    if not tax_id or not re.fullmatch(r"\d{8}", tax_id):
                        continue
                    source_rows += 1
                    if tax_id not in merchant_ids:
                        continue
                    matched_tax_ids.add(tax_id)
                    for priority, (code_index, name_index) in enumerate(industry_columns, start=1):
                        if len(row) <= max(code_index, name_index):
                            continue
                        code = row[code_index].strip()
                        name = row[name_index].strip()
                        if re.fullmatch(r"\d{6}", code) and name:
                            records.add((tax_id, code, name, priority))
            if source_rows == 0:
                raise ValueError("官方資料沒有有效統一編號，保留既有行業資料")
            return records, matched_tax_ids, source_rows
        except UnicodeDecodeError as exc:
            last_decode_error = exc
    raise ValueError("無法判斷行業資料 CSV 編碼") from last_decode_error


def _load_merchant_tax_ids(db_path):
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"資料庫不存在：{db_path}")
    uri = Path(db_path).resolve().as_uri() + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True, timeout=15)
    try:
        return {
            normalize_tax_id(row[0])
            for row in conn.execute("SELECT tax_id FROM merchants WHERE tax_id IS NOT NULL")
            if normalize_tax_id(row[0])
        }
    finally:
        conn.close()


def import_csv_to_db(csv_path, db_path, *, min_source_rows=0):
    """Atomically replace local industry rows from a CSV or ZIP source file."""
    merchant_ids = _load_merchant_tax_ids(db_path)
    records, matched_tax_ids, source_rows = _parse_source(csv_path, merchant_ids)
    if source_rows < min_source_rows:
        raise ValueError(
            f"官方行業資料筆數異常：{source_rows} < {min_source_rows}，保留既有資料"
        )
    if not records:
        raise ValueError("官方資料未對應到任何本地商家行業，保留既有資料")

    with database_lock(db_path):
        conn = sqlite3.connect(db_path, timeout=30)
        try:
            conn.execute("PRAGMA foreign_keys = ON")
            conn.execute("PRAGMA busy_timeout = 10000")
            current_tax_ids = {
                normalize_tax_id(row[0])
                for row in conn.execute("SELECT tax_id FROM merchants WHERE tax_id IS NOT NULL")
                if normalize_tax_id(row[0])
            }
            current_records = {
                (row[0], row[1], row[2], row[3])
                for row in conn.execute(
                    "SELECT tax_id, industry_code, industry_name, priority FROM merchant_industries"
                )
                if row[0] in current_tax_ids
            }
            valid_records = sorted(record for record in records if record[0] in current_tax_ids)
            if not valid_records:
                raise ValueError("匯入前沒有可對應的本地商家，保留既有行業資料")
            existing_classified = {
                record[0] for record in current_records
            }
            incoming_classified = {record[0] for record in valid_records}
            if (
                len(existing_classified) >= MIN_COVERAGE_BASE
                and len(incoming_classified) < len(existing_classified) * MIN_EXISTING_COVERAGE
            ):
                raise ValueError(
                    "行業資料涵蓋率異常："
                    f"{len(incoming_classified)} < {MIN_EXISTING_COVERAGE:.0%} of "
                    f"{len(existing_classified)}，保留既有資料"
                )
            if current_records == set(valid_records):
                print(f"Industry data is current: {len(valid_records)} records, {len(matched_tax_ids)} matched merchants.")
                return len(valid_records)

            if current_records:
                backup_path = backup_database(conn, db_path)
                print(f"Industry backup created: {backup_path}")
            conn.execute("BEGIN IMMEDIATE")
            conn.execute("DELETE FROM merchant_industries")
            conn.executemany(
                "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                valid_records,
            )
            conn.commit()
            print(
                f"Imported {len(valid_records)} industry records for "
                f"{len({record[0] for record in valid_records})} merchants "
                f"({len(matched_tax_ids)} of {source_rows} source tax IDs matched before update)."
            )
            return len(valid_records)
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def import_source_url(url, db_path):
    with tempfile.TemporaryDirectory(prefix="ntc-industry-") as temp_dir:
        archive_path = os.path.join(temp_dir, "industry.zip")
        total = 0
        with requests.get(url, stream=True, timeout=(15, 120)) as response:
            response.raise_for_status()
            content_length = response.headers.get("Content-Length")
            if content_length and int(content_length) > MAX_DOWNLOAD_BYTES:
                raise ValueError("官方行業資料超過允許下載大小")
            with open(archive_path, "wb") as archive_file:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    total += len(chunk)
                    if total > MAX_DOWNLOAD_BYTES:
                        raise ValueError("官方行業資料超過允許下載大小")
                    archive_file.write(chunk)
        if not zipfile.is_zipfile(archive_path):
            raise ValueError("官方行業資料下載內容不是有效 ZIP")
        return import_csv_to_db(archive_path, db_path, min_source_rows=MIN_SOURCE_ROWS)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import Ministry of Finance tax industry codes by merchant tax ID.")
    parser.add_argument("--csv", help="Local CSV or ZIP file; defaults to the official daily source URL.")
    parser.add_argument("--url", default=SOURCE_URL, help="Official source URL used when --csv is omitted.")
    parser.add_argument("--db", default=os.environ.get("DB_PATH", "backend/merchants.db"), help="SQLite database path.")
    args = parser.parse_args()
    if args.csv:
        import_csv_to_db(args.csv, args.db)
    else:
        import_source_url(args.url, args.db)
