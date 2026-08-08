import math
from typing import List, Dict, Any

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in kilometers between two points on the earth."""
    if lat1 is None or lon1 is None or lat2 is None or lon2 is None:
        return 0.0
    try:
        lat1, lon1, lat2, lon2 = float(lat1), float(lon1), float(lat2), float(lon2)
    except (ValueError, TypeError):
        return 0.0

    if math.isnan(lat1) or math.isnan(lon1) or math.isnan(lat2) or math.isnan(lon2) or \
       math.isinf(lat1) or math.isinf(lon1) or math.isinf(lat2) or math.isinf(lon2):
        return 0.0

    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    # Clamp floating point argument to [0.0, 1.0] to prevent ValueError math domain error
    a_clamped = max(0.0, min(1.0, a))
    c = 2 * math.atan2(math.sqrt(a_clamped), math.sqrt(max(0.0, 1.0 - a_clamped)))
    return R * c

def _extract_coord(pt: Dict[str, Any], key: str) -> float:
    """Safely extract float coordinate, treating 0.0 as valid and fallback to 0.0 for None or invalid."""
    if not isinstance(pt, dict):
        return 0.0
    val = pt.get(key)
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0

def optimize_route(points: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Given a list of point dicts with 'lat' and 'lon', return reordered points using Nearest Neighbor algorithm.
    """
    if not points or not isinstance(points, list):
        return {"points": [], "total_distance_km": 0.0}
    if len(points) <= 2:
        total_dist = 0.0
        if len(points) == 2:
            pt0 = points[0] if isinstance(points[0], dict) else {}
            pt1 = points[1] if isinstance(points[1], dict) else {}
            pt0_lat_valid = pt0.get("lat") is not None
            pt1_lat_valid = pt1.get("lat") is not None
            if pt0_lat_valid and pt1_lat_valid:
                total_dist = haversine_distance(
                    _extract_coord(pt0, "lat"),
                    _extract_coord(pt0, "lon"),
                    _extract_coord(pt1, "lat"),
                    _extract_coord(pt1, "lon")
                )
        return {"points": points, "total_distance_km": round(total_dist, 2)}

    # Pre-extract coordinates as float tuples once to avoid repetitive dict lookups and type conversions
    indexed_items = [(pt, _extract_coord(pt, "lat"), _extract_coord(pt, "lon")) for pt in points]

    current_pt, curr_lat, curr_lon = indexed_items.pop(0)
    route = [current_pt]
    total_dist = 0.0

    while indexed_items:
        nearest_idx = 0
        min_dist = float('inf')

        for i, (pt, pt_lat, pt_lon) in enumerate(indexed_items):
            dist = haversine_distance(curr_lat, curr_lon, pt_lat, pt_lon)
            if dist < min_dist:
                min_dist = dist
                nearest_idx = i

        current_pt, curr_lat, curr_lon = indexed_items.pop(nearest_idx)
        total_dist += min_dist
        route.append(current_pt)

    return {
        "points": route,
        "total_distance_km": round(total_dist, 2)
    }


