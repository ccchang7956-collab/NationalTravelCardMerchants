import csv
import os
import sys
import sqlite3
import argparse

def import_csv_to_db(csv_path: str, db_path: str):
    if not os.path.exists(csv_path):
        print(f"Error: CSV file {csv_path} not found.")
        sys.exit(1)
        
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        cursor = conn.cursor()
        
        # 讀取現有統編
        cursor.execute("SELECT tax_id FROM merchants WHERE tax_id IS NOT NULL")
        existing_tax_ids = {row[0] for row in cursor.fetchall()}
        
        # 讀取 CSV
        encodings = ["utf-8-sig", "cp950", "utf-8"]
        success = False
        
        for enc in encodings:
            try:
                deleted_tax_ids = set()
                to_delete_batch = []
                with open(csv_path, mode="r", encoding=enc) as f:
                    reader = csv.reader(f)
                    
                    # 跳過 header 行
                    try:
                        header = next(reader)
                    except StopIteration:
                        print("Warning: CSV file is empty. Skipping import.")
                        return
                    
                    batch = []
                    count = 0
                    for row in reader:
                        if not row or len(row) < 8:
                            continue
                        tax_id = row[1].strip()
                        if tax_id and tax_id in existing_tax_ids:
                            if tax_id not in deleted_tax_ids:
                                deleted_tax_ids.add(tax_id)
                                to_delete_batch.append((tax_id,))
                                if len(to_delete_batch) >= 1000:
                                    cursor.executemany("DELETE FROM merchant_industries WHERE tax_id = ?", to_delete_batch)
                                    to_delete_batch = []
                            # 解析主次行業 (最多四組)
                            # 欄位 index:
                            # 1: tax_id
                            # 8,9: 主代號, 主名稱
                            # 10,11: 次1代號, 次1名稱
                            # 12,13: 次2代號, 次2名稱
                            # 14,15: 次3代號, 次3名稱
                            for i in range(4):
                                base_idx = 8 + (i * 2)
                                if base_idx + 1 < len(row):
                                    code = row[base_idx].strip()
                                    name = row[base_idx + 1].strip()
                                    if code and name:
                                        batch.append((tax_id, code, name, i + 1))
                                        
                            if len(batch) >= 1000:
                                if to_delete_batch:
                                    cursor.executemany("DELETE FROM merchant_industries WHERE tax_id = ?", to_delete_batch)
                                    to_delete_batch = []
                                cursor.executemany(
                                    "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                                    batch
                                )
                                count += len(batch)
                                batch = []
                                
                    if to_delete_batch:
                        cursor.executemany("DELETE FROM merchant_industries WHERE tax_id = ?", to_delete_batch)
                        to_delete_batch = []
                    if batch:
                        cursor.executemany(
                            "INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES (?, ?, ?, ?)",
                            batch
                        )
                        count += len(batch)
                        
                conn.commit()
                print(f"Successfully imported {count} industry records.")
                success = True
                break
            except UnicodeDecodeError:
                conn.rollback()
                continue
            except Exception as e:
                conn.rollback()
                print(f"Error occurred: {e}")
                raise e
                
        if not success:
            print("Error: Could not decode CSV file with available encodings.")
            sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Import industry codes to merchants database.")
    parser.add_argument("--csv", required=True, help="Path to the tax registration CSV file.")
    parser.add_argument("--db", default="backend/merchants.db", help="Path to SQLite database.")
    args = parser.parse_args()
    import_csv_to_db(args.csv, args.db)
