import fitz
import sqlite3
import unicodedata
import re
import os
import sys

# Get absolute paths based on this script's location
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DB_PATH = os.path.join(PROJECT_ROOT, "backend", "merchants.db")
PDF_PATH = os.path.join(PROJECT_ROOT, "docs", "QualifiedRetailerList.pdf")

def normalize_text(text):
    return unicodedata.normalize("NFKC", text.strip())

def is_website(text):
    text = text.lower()
    if text.startswith("http") or text.startswith("www."):
        return True
    if ".com" in text or ".tw" in text or ".net" in text or ".org" in text:
        return True
    if not re.search(r'[\u4e00-\u9fff]', text) and '.' in text and ' ' not in text:
        return True
    return False

def split_merged(text):
    parts = re.split(r'\s{2,}|\u3000+', text)
    if len(parts) >= 2:
        return parts[0].strip(), "".join(parts[1:]).strip()
    return text.strip(), ""

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DROP TABLE IF EXISTS merchants")
    cursor.execute("""
        CREATE TABLE merchants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            address TEXT,
            zip_code TEXT,
            tax_id TEXT UNIQUE,
            website TEXT
        )
    """)
    cursor.execute("CREATE INDEX idx_name ON merchants(name)")
    cursor.execute("CREATE INDEX idx_zip_code ON merchants(zip_code)")
    cursor.execute("CREATE INDEX idx_tax_id ON merchants(tax_id)")
    conn.commit()
    return conn

def main():
    if not os.path.exists(PDF_PATH):
        print(f"Error: PDF not found at {PDF_PATH}")
        sys.exit(1)

    print(f"Opening PDF: {PDF_PATH}")
    try:
        doc = fitz.open(PDF_PATH)
    except Exception as e:
        print(f"Failed to open PDF with fitz: {e}")
        sys.exit(1)
        
    conn = init_db()
    cursor = conn.cursor()
    
    total_pages = len(doc)
    print(f"Total pages to process: {total_pages}")
    
    lines = []
    headers = {"特店名稱", "特店地址", "郵遞區號", "統一編號", "特店網頁位址", "國民旅遊卡特約商店清冊"}
    
    print("Reading text from PDF...")
    for page_num in range(0, total_pages):
        page = doc[page_num]
        text = page.get_text("text")
        for line in text.split('\n'):
            line = normalize_text(line)
            if line and line not in headers and not line.startswith("檔案日期"):
                lines.append(line)
                
    print(f"Total extracted lines: {len(lines)}")
    
    # Find all indices that contain exactly an 8-digit tax ID
    tax_id_pattern = re.compile(r"^\d{8}$")
    tax_indices = [i for i, line in enumerate(lines) if tax_id_pattern.match(line)]
    print(f"Found {len(tax_indices)} records (tax_ids).")
    
    records = []
    
    for k in range(len(tax_indices)):
        current_tax_idx = tax_indices[k]
        current_tax_id = lines[current_tax_idx]
        current_zip_code = lines[current_tax_idx - 1]
        
        prev_tax_idx = tax_indices[k-1] if k > 0 else -1
        
        # Items between previous tax_id and current zip_code
        items = lines[prev_tax_idx + 1 : current_tax_idx - 1]
        
        current_name = ""
        current_address = ""
        prev_website = None
        
        if len(items) == 3:
            prev_website = items[0]
            current_name = items[1]
            current_address = items[2]
        elif len(items) == 2:
            if is_website(items[0]):
                prev_website = items[0]
                current_name, current_address = split_merged(items[1])
            else:
                current_name = items[0]
                current_address = items[1]
        elif len(items) == 1:
            current_name, current_address = split_merged(items[0])
        elif len(items) == 0:
            print(f"Warning: Record {k} has no name/address items. Tax ID: {current_tax_id}")
            continue
        elif len(items) > 3:
            # Fallback if too many items, try to guess
            if is_website(items[0]):
                prev_website = items[0]
                current_name = items[1]
                current_address = "".join(items[2:])
            else:
                current_name = items[0]
                current_address = "".join(items[1:])
                
        # Assign previous website to the previous record
        if prev_website and k > 0:
            records[-1]['website'] = prev_website
            
        records.append({
            'name': current_name,
            'address': current_address,
            'zip_code': current_zip_code,
            'tax_id': current_tax_id,
            'website': None
        })
        
    # Check if the last record has a website
    if len(tax_indices) > 0:
        last_tax_idx = tax_indices[-1]
        last_items = lines[last_tax_idx + 1:]
        if len(last_items) > 0 and is_website(last_items[0]):
            records[-1]['website'] = last_items[0]

    print(f"Parsed {len(records)} records. Inserting into database...")
    
    insert_data = [(r['name'], r['address'], r['zip_code'], r['tax_id'], r['website']) for r in records]
    cursor.executemany(
        "INSERT OR IGNORE INTO merchants (name, address, zip_code, tax_id, website) VALUES (?, ?, ?, ?, ?)",
        insert_data
    )
    conn.commit()
    
    cursor.execute("SELECT COUNT(*) FROM merchants")
    count = cursor.fetchone()[0]
    print(f"Successfully inserted {count} records into {DB_PATH}")
    
    conn.close()

if __name__ == "__main__":
    main()
