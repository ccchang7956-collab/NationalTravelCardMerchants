import pytest
from backend.services.route_optimizer import optimize_route, haversine_distance

def test_haversine_distance():
    # Taipei 101 to Taipei Main Station (~5.5km)
    dist = haversine_distance(25.0339, 121.5645, 25.0478, 121.5170)
    assert 5.0 <= dist <= 6.5

def test_optimize_route_reorders_points():
    points = [
        {"id": 1, "lat": 25.0339, "lon": 121.5645, "name": "Taipei 101"}, # Taipei
        {"id": 2, "lat": 22.6273, "lon": 120.3014, "name": "Kaohsiung"},  # Kaohsiung (Far south)
        {"id": 3, "lat": 25.0478, "lon": 121.5170, "name": "Taipei Main"} # Taipei (Close to 101)
    ]
    result = optimize_route(points)
    # Starting from Taipei 101 (id 1), next should be Taipei Main (id 3) then Kaohsiung (id 2)
    order_ids = [p["id"] for p in result["points"]]
    assert order_ids == [1, 3, 2]
    assert result["total_distance_km"] > 0
