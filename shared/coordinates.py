import math
import re
import unicodedata


def normalize_address(address):
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", address or "").replace("臺", "台"))


def same_address(left, right):
    return normalize_address(left) == normalize_address(right)


def valid_coordinates(lat, lon):
    try:
        return (
            lat is not None and lon is not None
            and math.isfinite(float(lat)) and math.isfinite(float(lon))
            and -90 <= float(lat) <= 90 and -180 <= float(lon) <= 180
        )
    except (TypeError, ValueError):
        return False


def preservable_coordinates(lat, lon, address, geocoded_address):
    return valid_coordinates(lat, lon) and (not geocoded_address or same_address(address, geocoded_address))
