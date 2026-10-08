import sqlite3
import logging
import math
import os
import json
import heapq
from fastapi import APIRouter, Depends, Query, HTTPException, Response
from typing import Optional, List, Tuple
from backend.database import get_db, DB_PATH
from backend.models import MerchantListItem, MerchantDetail, PaginatedMerchants, Stats, CityStat, IndustryInfo

from backend.services.search_service import space_segment, parse_search_query
from shared.tax_industry import industry_group_for, industry_group_prefixes
from shared.search import normalize_text

log = logging.getLogger(__name__)

router = APIRouter()

TAIWAN_CITIES = ["基隆市", "台北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣", "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "台南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣", "連江縣"]


def append_city_website_filters(clauses, params, city, has_website):
    if city:
        safe_city = city.replace("臺", "台")
        prefixes = list(dict.fromkeys([safe_city, safe_city.replace("台", "臺")]))
        ranges = []
        for prefix in prefixes:
            if ord(prefix[-1]) < 0x10FFFF:
                upper = prefix[:-1] + chr(ord(prefix[-1]) + 1)
                ranges.append("(m.address >= ? AND m.address < ?)")
                params.extend([prefix, upper])
            else:
                ranges.append("(substr(m.address, 1, length(?)) = ?)")
                params.extend([prefix, prefix])
        clauses.append("(" + " OR ".join(ranges) + ")")
    if has_website is True:
        clauses.append("m.website IS NOT NULL AND m.website != ''")
    elif has_website is False:
        clauses.append("(m.website IS NULL OR m.website = '')")


def append_industry_filter(clauses, params, industry_code):
    if not industry_code:
        return
    prefixes = industry_group_prefixes(industry_code) or (industry_code,)
    patterns = []
    for prefix in prefixes:
        safe_prefix = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        patterns.append("mi.industry_code LIKE ? ESCAPE '\\'")
        params.append(f"{safe_prefix}%")
    clauses.append(f"""
        EXISTS (
            SELECT 1 FROM merchant_industries mi
            WHERE mi.tax_id = m.tax_id
              AND ({" OR ".join(patterns)})
        )
    """)

def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two lat/lon points. Missing/invalid -> inf (excluded).

    Invalid points must never appear as zero-distance nearby results.
    """
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return float("inf")
    try:
        lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)
    except (ValueError, TypeError):
        return float("inf")

    if math.isnan(lat1) or math.isnan(lon1) or math.isnan(lat2) or math.isnan(lon2) or \
       math.isinf(lat1) or math.isinf(lon1) or math.isinf(lat2) or math.isinf(lon2):
        return float("inf")

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
    page: int = Query(1, ge=1, le=10000, description="Page number"),
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

    append_city_website_filters(where_clauses, params, city, has_website)

    if zip_code:
        where_clauses.append("m.zip_code = ?")
        params.append(zip_code)

    append_industry_filter(where_clauses, params, industry_code)

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

        # 為了不影響 params 陣列，另外拷貝分頁參數
        query_params = list(params)
        if joins:
            # Apply relevance before pagination; literals never become LIKE patterns.
            normalized_query = normalize_text(q)[:100].casefold()
            db.create_function("search_name", 1, lambda name: normalize_text(name).casefold(), deterministic=True)
            query += """ ORDER BY
                CASE WHEN search_name(m.name) = ? THEN 0
                     WHEN substr(search_name(m.name), 1, length(?)) = ? THEN 1
                     ELSE 2 END,
                bm25(merchants_fts, 10.0, 1.0), m.id ASC
                LIMIT ? OFFSET ?"""
            query_params.extend([normalized_query, normalized_query, normalized_query])
        else:
            query += " ORDER BY m.id ASC LIMIT ? OFFSET ?"
        query_params.extend([per_page, offset])
        
        cursor.execute(query, query_params)
        rows = cursor.fetchall()
        items = [dict(row) for row in rows]
    except sqlite3.OperationalError as e:
        # DB 鎖住/毀損時回 503（舊版吞成 200 空結果，前端顯示「無商家」，監控也不會叫）
        log.error(f"get_merchants OperationalError: {e}")
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")

    return {
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
        "items": items
    }


@router.get("/merchants/nearby", response_model=List[MerchantListItem],
             description="附近搜尋：完整 bbox 候選精算 haversine，依距離與 ID 穩定排序、分頁，X-Total-Count 為符合半徑的完整筆數。")
def get_nearby_merchants(
    lat: float = Query(..., description="Latitude of center point"),
    lon: float = Query(..., description="Longitude of center point"),
    radius_km: float = Query(2.0, ge=0.1, le=20.0, description="Search radius in km"),
    q: Optional[str] = Query(None, description="Search keyword for name or address"),
    city: Optional[str] = Query(None, description="Filter by city"),
    has_website: Optional[bool] = Query(None, description="Filter by website availability"),
    industry_code: Optional[str] = Query(None, description="Filter by industry code (supports prefix wildcard matching)"),
    limit: int = Query(100, ge=1, le=500, description="Max number of results"),
    offset: int = Query(0, ge=0, le=1_000_000, description="Number of nearest results to skip"),
    db: sqlite3.Connection = Depends(get_db),
    response: Response = None,  # type: ignore[assignment] - FastAPI injects; direct calls may pass None
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
    min_lat = max(-90.0, lat - lat_delta)
    max_lat = min(90.0, lat + lat_delta)
    if abs_cos < 1e-9 or lon_delta >= 180.0:
        min_lon = -180.0
        max_lon = 180.0
    else:
        min_lon = lon - lon_delta
        max_lon = lon + lon_delta

    query = "SELECT m.* FROM merchants m"
    joins = []
    where_clauses = [
        "m.lat IS NOT NULL",
        "m.lon IS NOT NULL",
        "m.lat BETWEEN ? AND ?",
    ]
    params = [min_lat, max_lat]
    # 換日線包裹：min/max 超出 ±180 時 BETWEEN 會漏掉另一側，拆成 OR
    #（台灣本島碰不到，純正確性；極地 abs_cos≈0 已在上方收斂為全經度）
    if min_lon < -180.0:
        where_clauses.append("((m.lon >= ? AND m.lon <= 180.0) OR (m.lon >= -180.0 AND m.lon <= ?))")
        params.extend([min_lon + 360.0, max_lon])
    elif max_lon > 180.0:
        where_clauses.append("((m.lon >= ? AND m.lon <= 180.0) OR (m.lon >= -180.0 AND m.lon <= ?))")
        params.extend([min_lon, max_lon - 360.0])
    else:
        where_clauses.append("m.lon BETWEEN ? AND ?")
        params.extend([min_lon, max_lon])

    if q is not None and q.strip() != "":
        fts_query = parse_search_query(q)
        if not fts_query:
            if response is not None:
                response.headers["X-Total-Count"] = "0"
                response.headers["X-Has-More"] = "false"
            return []
        joins.append("JOIN merchants_fts f ON m.id = f.rowid")
        where_clauses.append("f.merchants_fts MATCH ?")
        params.append(fts_query)

    append_city_website_filters(where_clauses, params, city, has_website)

    append_industry_filter(where_clauses, params, industry_code)

    if joins:
        query += " " + " ".join(joins)
    if where_clauses:
        query += " WHERE " + " AND ".join(where_clauses)
    # Stream the complete candidate set; keep only the nearest offset+limit
    # rows in a heap instead of loading every merchant into Python memory.
    nearest = []
    total = 0
    keep = offset + limit
    cursor = db.cursor()
    try:
        cursor.execute(query, params)
        for row in cursor:
            dist = haversine(lat, lon, row["lat"], row["lon"])
            if dist > radius_km:
                continue
            total += 1
            entry = (-dist, -row["id"], dict(row))
            if len(nearest) < keep:
                heapq.heappush(nearest, entry)
            elif entry[:2] > nearest[0][:2]:
                heapq.heapreplace(nearest, entry)
    except sqlite3.OperationalError as e:
        log.error(f"get_nearby_merchants OperationalError: {e}")
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")
    
    nearest.sort(key=lambda entry: (-entry[0], -entry[1]))
    results = []
    for negative_distance, _, merchant in nearest[offset:offset + limit]:
        merchant["distance_km"] = round(-negative_distance, 3)
        results.append(merchant)
    if response is not None:
        response.headers["X-Total-Count"] = str(total)
        response.headers["X-Has-More"] = "true" if offset + limit < total else "false"
    return results


@router.get("/merchants/{merchant_id_or_tax_id}", response_model=MerchantDetail)
def get_merchant(merchant_id_or_tax_id: str, db: sqlite3.Connection = Depends(get_db)):
    try:
        cursor = db.cursor()
        row = None
        key = merchant_id_or_tax_id
        # 超長數字（>18 位不可能是 id；Python 3.11+ int() 4300 位上限會直接 ValueError）
        # 直接走 tax_id 查，查無即 404，避免掃描器輕易打爆 500
        if key.isdigit() and len(key) <= 18:
            cursor.execute("SELECT * FROM merchants WHERE id = ?", (int(key),))
            row = cursor.fetchone()
            if row is None:
                # 純數字亦可能是 tax_id（本國統編為 8 位數字），fallback 查 tax_id，確定性取最小 id
                cursor.execute("SELECT * FROM merchants WHERE tax_id = ? ORDER BY id ASC LIMIT 1", (key,))
                row = cursor.fetchone()
        else:
            cursor.execute("SELECT * FROM merchants WHERE tax_id = ? ORDER BY id ASC LIMIT 1", (key,))
            row = cursor.fetchone()
    except sqlite3.OperationalError as e:
        log.error(f"get_merchant OperationalError: {e}")
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")
    if not row:
        raise HTTPException(status_code=404, detail="Merchant not found")

    merchant = dict(row)

    # 撈取該店家的行業別，依 priority 排序
    try:
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
    except sqlite3.OperationalError as e:
        log.error(f"get_merchant industries OperationalError: {e}")
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")
    return merchant


def _read_stats_meta() -> dict:
    """讀 update_meta.json（與 /api/data-info 同來源），失敗回 {}。"""
    try:
        meta_path = os.path.join(os.path.dirname(DB_PATH), "update_meta.json")
        if not os.path.exists(meta_path):
            return {}
        with open(meta_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _read_stats_last_updated() -> Optional[str]:
    """讀 update_meta.json 取 last_updated，失敗回 None（與 /api/data-info 同來源）。"""
    val = _read_stats_meta().get("last_updated")
    return val if isinstance(val, str) and val else None


@router.get("/stats", response_model=Stats)
def get_stats(db: sqlite3.Connection = Depends(get_db)):
    try:
        cursor = db.cursor()

        # 一次掃表拿兩個總數（舊版三次掃表＋全量地址拉進 Python）
        cursor.execute("""
            SELECT COUNT(*),
                   SUM(website IS NOT NULL AND website <> '')
            FROM merchants
        """)
        row = cursor.fetchone()
        total = row[0]
        has_website = row[1] or 0

        # 城市分桶：DB 側 GROUP BY 前三字（縣市皆三字），Python 只歸納 ≤23 個桶
        # （舊版 54k 地址全拉回 Python 逐筆 startswith，慢兩個量級）
        cursor.execute("""
            SELECT substr(address, 1, 3) AS city3, COUNT(*)
            FROM merchants
            WHERE address IS NOT NULL AND address <> ''
            GROUP BY city3
        """)
        counts = {c: 0 for c in TAIWAN_CITIES}
        other = 0
        for r in cursor.fetchall():
            c3 = (r["city3"] or "").replace("臺", "台")
            if c3 in counts:
                counts[c3] += r[1]
            else:
                other += r[1]
    except sqlite3.OperationalError as e:
        log.error(f"get_stats OperationalError: {e}")
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")
    valid_cities = [
        {"city": c, "count": n} for c, n in counts.items() if n > 0
    ]
    if other > 0:
        valid_cities.append({"city": "其他", "count": other})
    valid_cities.sort(key=lambda x: x["count"], reverse=True)

    meta = _read_stats_meta()
    return {
        "total_merchants": total,
        "has_website": has_website,
        "cities": valid_cities,
        "last_updated": _read_stats_last_updated(),
        "last_checked": meta.get("last_checked"),
        "last_check_result": meta.get("last_check_result"),
        "last_successful_check": meta.get("last_successful_check"),
    }


@router.get("/industries", response_model=List[IndustryInfo])
def get_industries(db: sqlite3.Connection = Depends(get_db)):
    try:
        cursor = db.cursor()
        cursor.execute("""
            SELECT DISTINCT mi.industry_code, mi.industry_name
            FROM merchant_industries mi
            JOIN merchants m ON mi.tax_id = m.tax_id
            WHERE mi.industry_code != '' AND mi.industry_name != ''
            ORDER BY mi.industry_code ASC
        """)
        rows = cursor.fetchall()
    except sqlite3.OperationalError as e:
        log.error(f"get_industries OperationalError: {e}")
        raise HTTPException(status_code=503, detail="Database temporarily unavailable")
    industries = []
    for row in rows:
        code = row["industry_code"]
        group_code, group_name, order = industry_group_for(code)
        industries.append({
            "industry_code": code,
            "industry_name": row["industry_name"],
            "industry_group_code": group_code,
            "industry_group_name": group_name,
            "industry_group_order": order,
        })
    industries.sort(key=lambda item: (item["industry_group_order"], item["industry_code"]))
    return industries
