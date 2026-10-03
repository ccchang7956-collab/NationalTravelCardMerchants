import logging
import math
import os


def env_number(name, default, minimum, maximum, integer=False):
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw) if integer else float(raw)
        if not math.isfinite(value) or not minimum <= value <= maximum:
            raise ValueError("outside range")
        return value
    except (TypeError, ValueError, OverflowError):
        logging.warning("Invalid %s; using default %s", name, default)
        return default
