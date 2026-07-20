from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
import sqlite3
from backend.database import get_db
from backend.models import ExpenseCreate, ExpenseResponse, AssistantSummary, MerchantListItem
from backend.auth_utils import get_current_user

router = APIRouter()

@router.get("/assistant/summary", response_model=AssistantSummary)
def get_assistant_summary(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    user_id = current_user["id"]
    cursor = db.cursor()

    cursor.execute("""
        SELECT category, SUM(amount) as total
        FROM user_expenses
        WHERE user_id = ?
        GROUP BY category
    """, (user_id,))
    rows = cursor.fetchall()

    tourist_spent = 0
    general_spent = 0
    for row in rows:
        if row["category"] == "觀光旅遊":
            tourist_spent = row["total"] or 0
        elif row["category"] == "自行運用":
            general_spent = row["total"] or 0

    cursor.execute("SELECT COUNT(*) FROM user_favorites WHERE user_id = ?", (user_id,))
    favorites_count = cursor.fetchone()[0]

    tourist_target = 8000
    general_target = 8000

    return {
        "tourist_quota": {
            "target": tourist_target,
            "spent": tourist_spent,
            "remaining": max(0, tourist_target - tourist_spent),
            "percentage": round(min(100.0, (tourist_spent / tourist_target) * 100), 2)
        },
        "general_quota": {
            "target": general_target,
            "spent": general_spent,
            "remaining": max(0, general_target - general_spent),
            "percentage": round(min(100.0, (general_spent / general_target) * 100), 2)
        },
        "total_spent": tourist_spent + general_spent,
        "favorites_count": favorites_count
    }

@router.get("/assistant/expenses", response_model=List[ExpenseResponse])
def get_expenses(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT id, user_id, merchant_id, merchant_name, amount, category, expense_date, note, created_at
        FROM user_expenses
        WHERE user_id = ?
        ORDER BY expense_date DESC, id DESC
    """, (current_user["id"],))
    return [dict(row) for row in cursor.fetchall()]

@router.post("/assistant/expenses", response_model=ExpenseResponse)
def create_expense(
    expense_in: ExpenseCreate,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        INSERT INTO user_expenses (user_id, merchant_id, merchant_name, amount, category, expense_date, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        current_user["id"],
        expense_in.merchant_id,
        expense_in.merchant_name,
        expense_in.amount,
        expense_in.category,
        expense_in.expense_date,
        expense_in.note
    ))
    db.commit()
    expense_id = cursor.lastrowid

    cursor.execute("SELECT id, user_id, merchant_id, merchant_name, amount, category, expense_date, note, created_at FROM user_expenses WHERE id = ?", (expense_id,))
    return dict(cursor.fetchone())

@router.delete("/assistant/expenses/{expense_id}")
def delete_expense(
    expense_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("DELETE FROM user_expenses WHERE id = ? AND user_id = ?", (expense_id, current_user["id"]))
    if cursor.rowcount == 0:
        raise HTTPException(status_code=404, detail="Expense item not found")
    db.commit()
    return {"message": "Expense deleted successfully"}

@router.get("/assistant/favorites", response_model=List[MerchantListItem])
def get_favorites(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("""
        SELECT m.id, m.name, m.address, m.zip_code, m.tax_id, m.website, m.lat, m.lon
        FROM merchants m
        JOIN user_favorites f ON m.id = f.merchant_id
        WHERE f.user_id = ?
        ORDER BY f.created_at DESC
    """, (current_user["id"],))
    return [dict(row) for row in cursor.fetchall()]

@router.get("/assistant/favorites/ids", response_model=List[int])
def get_favorite_ids(
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("SELECT merchant_id FROM user_favorites WHERE user_id = ? ORDER BY id DESC", (current_user["id"],))
    return [row["merchant_id"] for row in cursor.fetchall()]

@router.post("/assistant/favorites/{merchant_id}")
def add_favorite(
    merchant_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("SELECT id FROM merchants WHERE id = ?", (merchant_id,))
    if not cursor.fetchone():
        raise HTTPException(status_code=404, detail="Merchant not found")

    try:
        cursor.execute(
            "INSERT INTO user_favorites (user_id, merchant_id) VALUES (?, ?)",
            (current_user["id"], merchant_id)
        )
        db.commit()
    except sqlite3.IntegrityError:
        pass  # Already favorited
    return {"message": "Merchant favorited successfully"}

@router.delete("/assistant/favorites/{merchant_id}")
def remove_favorite(
    merchant_id: int,
    current_user: dict = Depends(get_current_user),
    db: sqlite3.Connection = Depends(get_db)
):
    cursor = db.cursor()
    cursor.execute("DELETE FROM user_favorites WHERE user_id = ? AND merchant_id = ?", (current_user["id"], merchant_id))
    db.commit()
    return {"message": "Merchant unfavorited successfully"}
