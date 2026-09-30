import sqlite3
import math
import re
import unicodedata
from fastapi import APIRouter, Depends, Query, HTTPException
from typing import Optional, List, Tuple
from backend.database import get_db
from backend.models import MerchantListItem, MerchantDetail, PaginatedMerchants, Stats, CityStat, IndustryInfo

from backend.services.search_service import space_segment, parse_search_query

router = APIRouter()

TAIWAN_CITIES = ["基隆市", "台北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣", "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "台南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣", "連江縣"]

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two lat/lon points."""
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return 0.0
    try:
        lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)
    except (ValueError, TypeError):
        return 0.0

    if math.isnan(lat1) or math.isnan(lon1) or math.isnan(lat2) or math.isnan(lon2) or \
       math.isinf(lat1) or math.isinf(lon1) or math.isinf(lat2) or math.isinf(lon2):
        return 0.0

    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    a_clamped = max(0.0, min(1.0, a))
    return R * 2 * math.atan2(math.sqrt(a_clamped), math.sqrt(max(0.0, 1.0 - a_clamped)))

@router.get("/merchants", response_model=PaginatedMerchants)
def get_merchants(
    q: Optional[str] = Query(None, description="Search keyword for name or address"),
    city: Optional[str] = Query(None, description="Filter by city (e.g. 台北市)"),
    zip_code: Optional[str] = Query(None, description="Exact match zip code"),
    has_website: Optional[bool] = Query(None, description="Filter only stores with website"),
    industry_code: Optional[str] = Query(None, description="Filter by industry code (supports prefix wildcard matching)"),
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
    if q is not None and q.strip() != "":
        fts_query = parse_search_query(q)
        if not fts_query:
            return {
                "total": 0,
                "page": page,
                "per_page": per_page,
                "total_pages": 1,
                "items": []
            }
        joins.append("JOIN merchants_fts f ON m.id = f.rowid")
        where_clauses.append("f.merchants_fts MATCH ?")
        params.append(fts_query)

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

    if industry_code:
        safe_ind = industry_code.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where_clauses.append("""
            EXISTS (
                SELECT 1 FROM merchant_industries mi 
                WHERE mi.tax_id = m.tax_id 
                  AND mi.industry_code LIKE ? ESCAPE '\\'
                  AND mi.priority = 1
            )
        """)
        params.append(f"{safe_ind}%")

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
    try:
        cursor.execute(count_query, params)
        total = cursor.fetchone()[0]
        total_pages = math.ceil(total / per_page) if total > 0 else 1
        offset = (page - 1) * per_page

        query += " ORDER BY m.id ASC LIMIT ? OFFSET ?"
        # 為了不影響 params 陣列，另外拷貝分頁參數
        query_params = list(params)
        query_params.extend([per_page, offset])
        
        cursor.execute(query, query_params)
        rows = cursor.fetchall()
        items = [dict(row) for row in rows]
    except sqlite3.OperationalError:
        return {
            "total": 0,
            "page": page,
            "per_page": per_page,
            "total_pages": 1,
            "items": []
        }

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
        "items": items
    }


@router.get("/merchants/nearby", response_model=List[MerchantListItem])
def get_nearby_merchants(
    lat: float = Query(..., description="Latitude of center point"),
    lon: float = Query(..., description="Longitude of center point"),
    radius_km: float = Query(2.0, ge=0.1, le=20.0, description="Search radius in km"),
    q: Optional[str] = Query(None, description="Search keyword for name or address"),
    industry_code: Optional[str] = Query(None, description="Filter by industry code (supports prefix wildcard matching)"),
    limit: int = Query(100, ge=1, le=500, description="Max number of results"),
    db: sqlite3.Connection = Depends(get_db)
):
    if math.isnan(lat) or math.isnan(lon) or math.isinf(lat) or math.isinf(lon):
        raise HTTPException(status_code=400, detail="Invalid latitude or longitude")
    if not (-90.0 <= lat <= 90.0):
        raise HTTPException(status_code=400, detail="Latitude must be between -90.0 and 90.0")
    if not (-180.0 <= lon <= 180.0):
        raise HTTPException(status_code=400, detail="Longitude must be between -180.0 and 180.0")

    cos_val = math.cos(math.radians(lat))
    abs_cos = abs(cos_val)
    if abs_cos < 1e-9:
        lon_delta = 180.0
    else:
        lon_delta = min(radius_km / (111.0 * abs_cos), 180.0)

    lat_delta = radius_km / 111.0
    cos_lat_sq = cos_val * cos_val

    min_lat = max(-90.0, lat - lat_delta)
    max_lat = min(90.0, lat + lat_delta)
    if abs_cos < 1e-9 or lon_delta >= 180.0:
        min_lon = -180.0
        max_lon = 180.0
    else:
        min_lon = lon - lon_delta
        max_lon = lon + lon_delta

    query = f"""
        SELECT m.*, 
               ((m.lat - ?) * (m.lat - ?) + (m.lon - ?) * (m.lon - ?) * {cos_lat_sq}) AS _proxy_dist 
        FROM merchants m
    """
    joins = []
    where_clauses = [
        "m.lat IS NOT NULL",
        "m.lat BETWEEN ? AND ?",
        "m.lon BETWEEN ? AND ?"
    ]
    params = [lat, lat, lon, lon, min_lat, max_lat, min_lon, max_lon]

    if q is not None and q.strip() != "":
        fts_query = parse_search_query(q)
        if not fts_query:
            return []
        joins.append("JOIN merchants_fts f ON m.id = f.rowid")
        where_clauses.append("f.merchants_fts MATCH ?")
        params.append(fts_query)

    if industry_code:
        safe_ind = industry_code.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        where_clauses.append("""
            EXISTS (
                SELECT 1 FROM merchant_industries mi 
                WHERE mi.tax_id = m.tax_id 
                  AND mi.industry_code LIKE ? ESCAPE '\\'
                  AND mi.priority = 1
            )
        """)
        params.append(f"{safe_ind}%")

    if joins:
        query += " " + " ".join(joins)
    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)

    candidate_limit = max(limit * 3, 300)
    query += " ORDER BY _proxy_dist ASC LIMIT ?"
    params.append(candidate_limit)

    cursor = db.cursor()
    try:
        cursor.execute(query, params)
        rows = cursor.fetchall()
    except sqlite3.OperationalError:
        return []
    
    results = []
    for row in rows:
        m = dict(row)
        dist = haversine(lat, lon, m["lat"], m["lon"])
        if dist <= radius_km:
            m["distance_km"] = round(dist, 3)
            results.append(m)

    results.sort(key=lambda x: x["distance_km"])
    return results[:limit]


@router.get("/merchants/{merchant_id_or_tax_id}", response_model=MerchantDetail)
def get_merchant(merchant_id_or_tax_id: str, db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    row = None
    if merchant_id_or_tax_id.isdigit():
        cursor.execute("SELECT * FROM merchants WHERE id = ?", (int(merchant_id_or_tax_id),))
        row = cursor.fetchone()
        if row is None:
            # 純數字亦可能是 tax_id（本國統編為 8 位數字），fallback 查 tax_id
            cursor.execute("SELECT * FROM merchants WHERE tax_id = ?", (merchant_id_or_tax_id,))
            row = cursor.fetchone()
    else:
        cursor.execute("SELECT * FROM merchants WHERE tax_id = ?", (merchant_id_or_tax_id,))
        row = cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Merchant not found")
    
    merchant = dict(row)
    
    # 撈取該店家的行業別，依 priority 排序
    tax_id = merchant.get("tax_id")
    if not tax_id:
        merchant["industries"] = []
    else:
        ind_cursor = db.cursor()
        ind_cursor.execute(
            "SELECT industry_code, industry_name, priority FROM merchant_industries WHERE tax_id = ? ORDER BY priority ASC",
            (tax_id,)
        )
        industries = [dict(r) for r in ind_cursor.fetchall()]
        merchant["industries"] = industries
    return merchant


@router.get("/stats", response_model=Stats)
def get_stats(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()

    cursor.execute("SELECT COUNT(*) FROM merchants")
    total = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM merchants WHERE website IS NOT NULL AND website != ''")
    has_website = cursor.fetchone()[0]

    cursor.execute("""
        SELECT address FROM merchants
        WHERE address IS NOT NULL AND address != ''
    """)
    counts = {c: 0 for c in TAIWAN_CITIES}
    other = 0
    for row in cursor.fetchall():
        addr = row["address"] or ""
        for c in TAIWAN_CITIES:
            if addr.startswith(c):
                counts[c] += 1
                break
        else:
            other += 1
    valid_cities = [
        {"city": c, "count": n} for c, n in counts.items() if n > 0
    ]
    if other > 0:
        valid_cities.append({"city": "其他", "count": other})
    valid_cities.sort(key=lambda x: x["count"], reverse=True)

    return {
        "total_merchants": total,
        "has_website": has_website,
        "cities": valid_cities
    }


@router.get("/industries", response_model=List[IndustryInfo])
def get_industries(db: sqlite3.Connection = Depends(get_db)):
    cursor = db.cursor()
    cursor.execute("""
        SELECT DISTINCT mi.industry_code, mi.industry_name 
        FROM merchant_industries mi
        JOIN merchants m ON mi.tax_id = m.tax_id
        WHERE mi.industry_code != '' AND mi.industry_name != ''
          AND mi.priority = 1
        ORDER BY mi.industry_code ASC
    """)
    return [{"industry_code": row["industry_code"], "industry_name": row["industry_name"]} for row in cursor.fetchall()]
