import sqlite3
import math
import re
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List, Tuple
from backend.database import get_db
from backend.models import Merchant, MerchantWithCoords, PaginatedMerchants, Stats, CityStat

def parse_search_query(q: Optional[str]) -> Tuple[Optional[str], List[str]]:
    """
    解析搜尋字串 q。
    回傳:
      - fts_query: 適用於 FTS5 MATCH 的字串 (長度 >= 3 的詞以 AND 連接，並用雙引號包覆)
      - like_terms: 適用於 LIKE 的剩餘短詞 (長度 < 3)
    """
    if not q:
        return None, []
    
    terms = []
    seen = set()
    for t in q.split():
        t_clean = t.strip()
        if t_clean and t_clean not in seen:
            seen.add(t_clean)
            terms.append(t_clean)
            
    fts_parts = []
    like_terms = []
    
    for term in terms:
        if len(term) >= 3:
            escaped = term.replace('"', '""')
            fts_parts.append(f'"{escaped}"')
        else:
            like_terms.append(term)
            
    fts_query = " AND ".join(fts_parts) if fts_parts else None
    return fts_query, like_terms

router = APIRouter()

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two lat/lon points."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

@router.get("/merchants", response_model=PaginatedMerchants)
def get_merchants(
    q: Optional[str] = Query(None, description="Search keyword for name or address"),
    city: Optional[str] = Query(None, description="Filter by city (e.g. 台北市)"),
    zip_code: Optional[str] = Query(None, description="Exact match zip code"),
    has_website: Optional[bool] = Query(None, description="Filter only stores with website"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    db: sqlite3.Connection = Depends(get_db)
):
    query = "SELECT m.* FROM merchants m"
    count_query = "SELECT COUNT(*) FROM merchants m"
    joins = []
    where_clauses = []
    params = []

    # 解析搜尋關鍵字
    if q:
        fts_query, like_terms = parse_search_query(q)
        if fts_query:
            joins.append("JOIN merchants_fts f ON m.id = f.rowid")
            where_clauses.append("f.merchants_fts MATCH ?")
            params.append(fts_query)
            
        for term in like_terms:
            safe_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            where_clauses.append("(m.name LIKE ? ESCAPE '\\' OR m.address LIKE ? ESCAPE '\\')")
            params.extend([f"%{safe_term}%", f"%{safe_term}%"])

    if city:
        safe_city = city.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where_clauses.append("m.address LIKE ? ESCAPE '\\'")
        params.append(f"{safe_city}%")

    if zip_code:
        where_clauses.append("m.zip_code = ?")
        params.append(zip_code)

    if has_website is True:
        where_clauses.append("m.website IS NOT NULL AND m.website != ''")
    elif has_website is False:
        where_clauses.append("(m.website IS NULL OR m.website = '')")

    # 拼接 JOIN
    if joins:
        join_str = " " + " ".join(joins)
        query += join_str
        count_query += join_str

    # 拼接 WHERE
    if where_clauses:
        where_str = " WHERE " + " AND ".join(where_clauses)
        query += where_str
        count_query += where_str

    cursor = db.cursor()
    cursor.execute(count_query, params)
    total = cursor.fetchone()[0]
    total_pages = math.ceil(total / per_page) if total > 0 else 1
    offset = (page - 1) * per_page

    query += " LIMIT ? OFFSET ?"
    # 為了不影響 params 陣列，另外拷貝分頁參數
    query_params = list(params)
    query_params.extend([per_page, offset])
    
    cursor.execute(query, query_params)
    rows = cursor.fetchall()
    items = [dict(row) for row in rows]

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
        "items": items
    }


@router.get("/merchants/nearby", response_model=List[MerchantWithCoords])
def get_nearby_merchants(
    lat: float = Query(..., ge=-89.0, le=89.0, description="Latitude of center point"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude of center point"),
    radius_km: float = Query(2.0, ge=0.1, le=50.0, description="Search radius in km"),
    q: Optional[str] = Query(None, description="Search keyword for name or address"),
    limit: int = Query(100, ge=1, le=500, description="Max number of results"),
    db: sqlite3.Connection = Depends(get_db)
):
    # Approx degrees per km
    lat_delta = radius_km / 111.0
    lon_delta = min(radius_km / (111.0 * math.cos(math.radians(lat))), 180.0)

    query = "SELECT m.* FROM merchants m"
    joins = []
    where_clauses = [
        "m.lat IS NOT NULL",
        "m.lat BETWEEN ? AND ?",
        "m.lon BETWEEN ? AND ?"
    ]
    params = [lat - lat_delta, lat + lat_delta, lon - lon_delta, lon + lon_delta]

    if q:
        fts_query, like_terms = parse_search_query(q)
        if fts_query:
            joins.append("JOIN merchants_fts f ON m.id = f.rowid")
            where_clauses.append("f.merchants_fts MATCH ?")
            params.append(fts_query)
            
        for term in like_terms:
            safe_term = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            where_clauses.append("(m.name LIKE ? ESCAPE '\\' OR m.address LIKE ? ESCAPE '\\')")
            params.extend([f"%{safe_term}%", f"%{safe_term}%"])

    if joins:
        query += " " + " ".join(joins)
    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)

    cursor = db.cursor()
    cursor.execute(query, params)
    rows = cursor.fetchall()
    
    results = []
    for row in rows:
        m = dict(row)
        dist = haversine(lat, lon, m["lat"], m["lon"])
        if dist <= radius_km:
            m["distance_km"] = round(dist, 3)
            results.append(m)

    results.sort(key=lambda x: x["distance_km"])
    return results[:limit]


@router.get("/merchants/{merchant_id_or_tax_id}", response_model=MerchantWithCoords)
def get_merchant(merchant_id_or_tax_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("SELECT * FROM merchants WHERE tax_id = ? OR id = ?", (merchant_id_or_tax_id, merchant_id_or_tax_id))
    row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Merchant not found")
    return dict(row)


@router.get("/stats", response_model=Stats)
def get_stats(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM merchants")
    total = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM merchants WHERE website IS NOT NULL AND website != ''")
    has_website = cursor.fetchone()[0]

    cursor.execute("""
        SELECT SUBSTR(address, 1, 3) as city, COUNT(*) as count
        FROM merchants
        WHERE address IS NOT NULL AND address != ''
        GROUP BY SUBSTR(address, 1, 3)
        ORDER BY count DESC
    """)
    # 台灣有效縣市清單 (排除雜訊)
    taiwan_city_pattern = re.compile(r'^[\u4e00-\u9fff]{3}$') # 匹配 3 個中文字 (如 台北市、南投縣)
    valid_cities = []
    for row in cursor.fetchall():
        city_name = row["city"]
        if city_name and taiwan_city_pattern.match(city_name):
            valid_cities.append({"city": city_name, "count": row["count"]})

    return {
        "total_merchants": total,
        "has_website": has_website,
        "cities": valid_cities
    }
