import sqlite3
from backend.database import init_db
from shared.schema import migrate_database

def test_init_db_creates_user_tables():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)
    
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = {row["name"] for row in cursor.fetchall()}
    
    assert "merchants" in tables
    assert "merchant_industries" in tables
    assert "merchants_fts" in tables
    assert "users" in tables
    assert "user_expenses" in tables
    assert "user_favorites" in tables
    assert "user_itineraries" in tables
    assert "itinerary_items" in tables

def test_init_db_creates_indexes():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)

    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='index';")
    indexes = {row["name"] for row in cursor.fetchall()}

    assert "idx_merchants_tax_id" in indexes
    assert "idx_merchants_zip_code" in indexes
    assert "idx_merchants_lat_lon" in indexes
    assert "idx_merchants_address" in indexes
    assert "idx_merchant_industries_tax_id" in indexes
    assert "idx_merchant_industries_code" in indexes
    assert "idx_user_expenses_user" in indexes
    assert "idx_user_favorites_user" in indexes
    assert "idx_user_itineraries_user" in indexes

def test_init_db_allows_multiple_branches_per_tax_id_and_shares_industry():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    init_db(conn)

    cursor = conn.cursor()
    cursor.execute("INSERT INTO merchants (name, address, tax_id) VALUES ('Merchant A', '台北市中正區', '12345678')")
    cursor.execute("INSERT INTO merchants (name, address, tax_id) VALUES ('Merchant A 分店', '新北市板橋區', '12345678')")
    cursor.execute("INSERT INTO merchant_tax_ids (tax_id) VALUES ('12345678')")
    cursor.execute("INSERT INTO merchant_industries (tax_id, industry_code, industry_name, priority) VALUES ('12345678', '551011', '旅館業', 1)")
    conn.commit()

    branches = cursor.execute("""
        SELECT m.name FROM merchants m
        WHERE EXISTS (
            SELECT 1 FROM merchant_industries i
            WHERE i.tax_id=m.tax_id AND i.industry_code LIKE '55%'
        )
        ORDER BY m.id
    """).fetchall()
    assert [row[0] for row in branches] == ["Merchant A", "Merchant A 分店"]


def test_legacy_merchant_schema_migration_preserves_ids_and_relationships(tmp_path):
    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript("""
        CREATE TABLE merchants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, address TEXT, zip_code TEXT,
            tax_id TEXT UNIQUE, website TEXT, lat REAL, lon REAL
        );
        CREATE VIRTUAL TABLE merchants_fts USING fts5(name, address);
        CREATE TABLE merchant_industries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tax_id TEXT NOT NULL, industry_code TEXT NOT NULL,
            industry_name TEXT NOT NULL, priority INTEGER NOT NULL,
            FOREIGN KEY(tax_id) REFERENCES merchants(tax_id) ON DELETE CASCADE
        );
        CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
        CREATE TABLE user_favorites (
            id INTEGER PRIMARY KEY, user_id INTEGER,
            merchant_id INTEGER REFERENCES merchants(id) ON DELETE CASCADE
        );
        CREATE TABLE user_expenses (
            id INTEGER PRIMARY KEY, merchant_id INTEGER REFERENCES merchants(id) ON DELETE SET NULL
        );
        CREATE TABLE user_itineraries (id INTEGER PRIMARY KEY);
        CREATE TABLE itinerary_items (
            id INTEGER PRIMARY KEY, itinerary_id INTEGER,
            merchant_id INTEGER REFERENCES merchants(id) ON DELETE SET NULL
        );
        INSERT INTO merchants(id,name,address,tax_id,lat,lon)
            VALUES (41,'Legacy Hotel','台北市中正區','12345678',25.04,121.51);
        INSERT INTO merchants_fts(rowid,name,address) VALUES (41,'Legacy Hotel','台北市中正區');
        INSERT INTO merchant_industries(tax_id,industry_code,industry_name,priority)
            VALUES ('12345678','551011','旅館業',1);
        INSERT INTO users(id,email) VALUES (7,'user@example.test');
        INSERT INTO user_favorites(id,user_id,merchant_id) VALUES (9,7,41);
        INSERT INTO user_expenses(id,merchant_id) VALUES (10,41);
        INSERT INTO user_itineraries(id) VALUES (11);
        INSERT INTO itinerary_items(id,itinerary_id,merchant_id) VALUES (12,11,41);
    """)
    conn.commit()

    assert migrate_database(conn, backup=False) is True

    assert tuple(conn.execute("SELECT id,name FROM merchants WHERE id=41").fetchone()) == (41, "Legacy Hotel")
    assert [tuple(row) for row in conn.execute("SELECT tax_id,industry_code FROM merchant_industries").fetchall()] == [("12345678", "551011")]
    conn.execute("INSERT INTO merchants(name,address,tax_id) VALUES ('Legacy Hotel Branch','新北市板橋區','12345678')")
    assert conn.execute("SELECT COUNT(*) FROM merchants WHERE tax_id='12345678'").fetchone()[0] == 2
    assert conn.execute("SELECT merchant_id FROM user_favorites WHERE id=9").fetchone()[0] == 41
    assert conn.execute("SELECT merchant_id FROM user_expenses WHERE id=10").fetchone()[0] == 41
    assert conn.execute("SELECT merchant_id FROM itinerary_items WHERE id=12").fetchone()[0] == 41
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    migrated_indexes = {row[1] for row in conn.execute("PRAGMA index_list(merchants)")}
    assert {"idx_merchants_tax_id", "idx_merchants_zip_code", "idx_merchants_lat_lon", "idx_merchants_address"}.issubset(migrated_indexes)
    industry_fk = conn.execute("PRAGMA foreign_key_list(merchant_industries)").fetchone()
    assert industry_fk[2] == "merchant_tax_ids"
    conn.close()


def test_industry_search_and_detail_api_return_each_branch():
    from fastapi.testclient import TestClient
    from backend.database import get_db
    from backend.main import app

    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    init_db(conn)
    conn.execute("INSERT INTO merchant_tax_ids(tax_id) VALUES ('12345678')")
    conn.executemany(
        "INSERT INTO merchants(id,name,address,tax_id) VALUES (?,?,?,?)",
        [
            (101, "Hotel North", "台北市中正區", "12345678"),
            (102, "Hotel South", "高雄市前金區", "12345678"),
        ],
    )
    conn.execute("INSERT INTO merchant_industries(tax_id,industry_code,industry_name,priority) VALUES ('12345678','551011','旅館業',1)")
    conn.commit()

    def _db():
        yield conn

    app.dependency_overrides[get_db] = _db
    try:
        client = TestClient(app)
        response = client.get("/api/merchants", params={"industry_code": "55"})
        assert response.status_code == 200
        assert [item["id"] for item in response.json()["items"]] == [101, 102]
        for merchant_id, expected_address in ((101, "台北市中正區"), (102, "高雄市前金區")):
            detail = client.get(f"/api/merchants/{merchant_id}")
            assert detail.status_code == 200
            assert detail.json()["address"] == expected_address
            assert detail.json()["industries"][0]["industry_code"] == "551011"
    finally:
        app.dependency_overrides.pop(get_db, None)
        conn.close()
