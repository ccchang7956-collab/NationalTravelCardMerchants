from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Dict, Any
import math
import sqlite3
from backend.database import get_db
from backend.models import ItineraryCreate, ItineraryUpdate, ItineraryResponse, ItineraryItemCreate
from backend.auth_utils import get_current_user
from backend.services.route_optimizer import optimize_route

router = APIRouter()

@router.get("/itineraries", response_model=List[ItineraryResponse])
def get_itineraries(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT id, user_id, title, start_date, notes, created_at, updated_at
        FROM user_itineraries
        WHERE user_id = ?
        ORDER BY updated_at DESC
    """, (current_user["id"],))
    rows = cursor.fetchall()
    
    result = []
    for row in rows:
        itin_id = row["id"]
        cursor.execute("""
            SELECT id, itinerary_id, merchant_id, custom_name, address, lat, lon, order_index, estimated_cost, quota_category, stay_minutes
            FROM itinerary_items
            WHERE itinerary_id = ?
            ORDER BY order_index ASC
        """, (itin_id,))
        items = [dict(i) for i in cursor.fetchall()]
        
        tourist_quota = sum(i["estimated_cost"] for i in items if i["quota_category"] == "觀光旅遊")
        general_quota = sum(i["estimated_cost"] for i in items if i["quota_category"] in ("自行運用", "一般消費"))
        
        result.append({
            **dict(row),
            "items": items,
            "total_tourist_quota": tourist_quota,
            "total_general_quota": general_quota
        })
    return result

@router.post("/itineraries", response_model=ItineraryResponse)
def create_itinerary(
    itin_in: ItineraryCreate,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    try:
        cursor.execute("""
            INSERT INTO user_itineraries (user_id, title, start_date, notes)
            VALUES (?, ?, ?, ?)
        """, (current_user["id"], itin_in.title, itin_in.start_date, itin_in.notes))
        itin_id = cursor.lastrowid

        for idx, item in enumerate(itin_in.items):
            cursor.execute("""
                INSERT INTO itinerary_items (itinerary_id, merchant_id, custom_name, address, lat, lon, order_index, estimated_cost, quota_category, stay_minutes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                itin_id, item.merchant_id, item.custom_name, item.address, item.lat, item.lon, idx, item.estimated_cost, item.quota_category, item.stay_minutes
            ))
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save itinerary")

    return get_itinerary_detail(itin_id, current_user, db)

@router.get("/itineraries/{itinerary_id}", response_model=ItineraryResponse)
def get_itinerary_detail(
    itinerary_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT id, user_id, title, start_date, notes, created_at, updated_at
        FROM user_itineraries
        WHERE id = ? AND user_id = ?
    """, (itinerary_id, current_user["id"]))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Itinerary not found")
        
    cursor.execute("""
        SELECT id, itinerary_id, merchant_id, custom_name, address, lat, lon, order_index, estimated_cost, quota_category, stay_minutes
        FROM itinerary_items
        WHERE itinerary_id = ?
        ORDER BY order_index ASC
    """, (itinerary_id,))
    items = [dict(i) for i in cursor.fetchall()]

    tourist_quota = sum(i["estimated_cost"] for i in items if i["quota_category"] == "觀光旅遊")
    general_quota = sum(i["estimated_cost"] for i in items if i["quota_category"] in ("自行運用", "一般消費"))

    return {
        **dict(row),
        "items": items,
        "total_tourist_quota": tourist_quota,
        "total_general_quota": general_quota
    }

@router.put("/itineraries/{itinerary_id}", response_model=ItineraryResponse)
def update_itinerary(
    itinerary_id: int,
    itin_in: ItineraryUpdate,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT id FROM user_itineraries WHERE id = ? AND user_id = ?
    """, (itinerary_id, current_user["id"]))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Itinerary not found")

    update_fields = []
    params = []
    if itin_in.title is not None:
        update_fields.append("title = ?")
        params.append(itin_in.title)
    if itin_in.start_date is not None:
        update_fields.append("start_date = ?")
        params.append(itin_in.start_date)
    if itin_in.notes is not None:
        update_fields.append("notes = ?")
        params.append(itin_in.notes)
    
    if update_fields:
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        query = f"UPDATE user_itineraries SET {', '.join(update_fields)} WHERE id = ? AND user_id = ?"
        params.extend([itinerary_id, current_user["id"]])

    try:
        if update_fields:
            cursor.execute(query, tuple(params))

        if itin_in.items is not None:
            cursor.execute("DELETE FROM itinerary_items WHERE itinerary_id = ?", (itinerary_id,))
            for idx, item in enumerate(itin_in.items):
                cursor.execute("""
                    INSERT INTO itinerary_items (itinerary_id, merchant_id, custom_name, address, lat, lon, order_index, estimated_cost, quota_category, stay_minutes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    itinerary_id, item.merchant_id, item.custom_name, item.address, item.lat, item.lon, idx, item.estimated_cost, item.quota_category, item.stay_minutes
                ))

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save itinerary")
    return get_itinerary_detail(itinerary_id, current_user, db)

@router.delete("/itineraries/{itinerary_id}")
def delete_itinerary(
    itinerary_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("DELETE FROM user_itineraries WHERE id = ? AND user_id = ?", (itinerary_id, current_user["id"]))
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Itinerary not found")
    db.commit()
    return {"message": "Itinerary deleted successfully"}

@router.post("/itineraries/optimize")
def optimize_itinerary_points(
    payload: Dict[str, Any],
    current_user: dict = Depends(get_current_user)
):
    points = payload.get("points", [])
    if not isinstance(points, list) or not (1 <= len(points) <= 100):
        raise HTTPException(status_code=400, detail="points must be 1..100")
    for p in points:
        if not isinstance(p, dict):
            raise HTTPException(status_code=400, detail="Invalid coordinate")
        try:
            lat = float(p.get("lat"))
            lon = float(p.get("lon"))
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid coordinate")
        if not (math.isfinite(lat) and math.isfinite(lon)):
            raise HTTPException(status_code=400, detail="Invalid coordinate")
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise HTTPException(status_code=400, detail="Invalid coordinate")
    return optimize_route(points)
