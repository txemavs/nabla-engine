"""Versioned normalized OSM extracts. Terrain samples remain client-owned."""
import json
import math
import os
import tempfile
from pathlib import Path

VERSION = 1

def valid_bake(data, lat, lon, key):
    try:
        return (data['source']['baked'] is True
                and data['source']['bakeVersion'] == VERSION
                and data['source']['tileKey'] == key
                and abs(data['origin']['latitude'] - lat) < 0.00001
                and abs(data['origin']['longitude'] - lon) < 0.00001
                and math.isfinite(data['origin']['altitude'])
                and data['terrain']['columns'] == 121
                and data['terrain']['rows'] == 121
                and data['terrain']['spacing'] == 10
                and len(data['terrain']['heights']) == 14641
                and isinstance(data['features'], list))
    except (KeyError, TypeError, ValueError):
        return False

def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, suffix='.tmp', delete=False) as file:
            temporary = file.name
            json.dump(data, file, separators=(',', ':'), allow_nan=False)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)
