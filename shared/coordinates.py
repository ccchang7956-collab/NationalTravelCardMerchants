import math
import re
import unicodedata


def normalize_address(address):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", address or "").replace("臺", "台"))


def same_address(left, right):
    return normalize_address(left) == normalize_address(right)


def valid_coordinates(lat, lon):
    try:
        if lat is None or lon is None:
            return False
        flat, flon = float(lat), float(lon)
        if not (math.isfinite(flat) and math.isfinite(flon)):
            return False
        if not (-90 <= flat <= 90 and -180 <= flon <= 180):
            return False
        # Null Island 明確拒絕（舊資料髒座標不保留）
        if flat == 0.0 and flon == 0.0:
            return False
        return True
    except (TypeError, ValueError):
        return False


def preservable_coordinates(lat, lon, address, geocoded_address):
    return valid_coordinates(lat, lon) and (not geocoded_address or same_address(address, geocoded_address))
