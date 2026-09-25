def to_float(value, default=0.0):
    try:
        return float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return default


def to_int(value, default=0):
    try:
        return int(float(str(value).replace(",", ".")))
    except (TypeError, ValueError):
        return default
