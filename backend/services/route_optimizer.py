import math
from typing import List, Dict, Any

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance in kilometers between two points on the earth."""
    R = 6371.0  # Earth radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def optimize_route(points: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Given a list of point dicts with 'lat' and 'lon', return reordered points using Nearest Neighbor algorithm.
    """
    if not points:
        return {"points": [], "total_distance_km": 0.0}
    if len(points) <= 2:
        total_dist = 0.0
        if len(points) == 2 and points[0].get("lat") and points[1].get("lat"):
            total_dist = haversine_distance(points[0]["lat"], points[0]["lon"], points[1]["lat"], points[1]["lon"])
        return {"points": points, "total_distance_km": round(total_dist, 2)}

    unvisited = points.copy()
    current = unvisited.pop(0)
    route = [current]
    total_dist = 0.0

    while unvisited:
        nearest_idx = 0
        min_dist = float('inf')
        
        curr_lat = current.get("lat") or 0.0
        curr_lon = current.get("lon") or 0.0

        for i, pt in enumerate(unvisited):
            pt_lat = pt.get("lat") or 0.0
            pt_lon = pt.get("lon") or 0.0
            dist = haversine_distance(curr_lat, curr_lon, pt_lat, pt_lon)
            if dist < min_dist:
                min_dist = dist
                nearest_idx = i

        current = unvisited.pop(nearest_idx)
        total_dist += min_dist
        route.append(current)

    return {
        "points": route,
        "total_distance_km": round(total_dist, 2)
    }
