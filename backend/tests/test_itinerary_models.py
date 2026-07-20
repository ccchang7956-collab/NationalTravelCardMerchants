import pytest
import sqlite3
from backend.database import init_db
from backend.models import ItineraryCreate, ItineraryItemCreate

def test_database_tables_exist(tmp_path, monkeypatch):
    test_db = str(tmp_path / "test_merchants.db")
    monkeypatch.setattr("backend.database.DB_PATH", test_db)
    init_db()

    conn = sqlite3.connect(test_db)
    cursor = conn.cursor()
    
    # Verify tables created
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='user_itineraries'")
    assert cursor.fetchone() is not None

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='itinerary_items'")
    assert cursor.fetchone() is not None
    conn.close()

def test_itinerary_pydantic_validation():
    item = ItineraryItemCreate(
        custom_name="台北101店",
        lat=25.0339,
        lon=121.5645,
        estimated_cost=500.0,
        quota_category="觀光旅遊"
    )
    itinerary = ItineraryCreate(
        title="台北小旅行",
        items=[item]
    )
    assert itinerary.title == "台北小旅行"
    assert itinerary.items[0].custom_name == "台北101店"
