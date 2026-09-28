"""Overture buildings and roads, shaped as the OSM features the publisher already extrudes.

Fetched once per cell at generation. The GLB does not call Overture again.
"""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

RELEASE = '2026-09-23.0'
BUILDINGS = f's3://overturemaps-us-west-2/release/{RELEASE}/theme=buildings/type=building/*'
SEGMENTS = f's3://overturemaps-us-west-2/release/{RELEASE}/theme=transportation/type=segment/*'
ROOF_SHAPES = {'gabled', 'hipped', 'skillion', 'pyramidal'}
FOOT = {'footway', 'path', 'pedestrian', 'cycleway', 'bridleway', 'steps'}


def _duckdb():
    found = os.environ.get('DUCKDB') or shutil.which('duckdb')
    if found:
        return found
    candidate = Path(__file__).resolve().parents[3] / '.duckdb' / 'duckdb'
    return str(candidate) if candidate.is_file() else None


def _with_publisher_id(feature):
    if feature['id'].startswith(('way/', 'node/', 'relation/')) and feature['id'].split('/', 1)[1].isdigit():
        return feature
    return {**feature, 'id': _feature_id(feature['id'])}


def _feature_id(value):
    """The baked publisher only accepts way/node/relation ids. Stable, not an OSM id."""
    number = int.from_bytes(hashlib.sha256(value.encode()).digest()[:8], 'big') % 10**15
    return f'way/{number or 1}'


def _rings(geo):
    kind = geo.get('type')
    coords = geo.get('coordinates') or []
    if kind == 'Polygon':
        return [{'role': 'inner' if i else 'outer', 'coordinates': ring} for i, ring in enumerate(coords) if len(ring) >= 4]
    if kind == 'MultiPolygon':
        rings = []
        for polygon in coords:
            rings.extend({'role': 'inner' if i else 'outer', 'coordinates': ring} for i, ring in enumerate(polygon) if len(ring) >= 4)
        return rings
    if kind == 'LineString' and len(coords) >= 2:
        return [{'role': 'outer', 'coordinates': coords}]
    if kind == 'MultiLineString':
        return [{'role': 'outer', 'coordinates': line} for line in coords if len(line) >= 2]
    return []


def _num(value):
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return f'{number:.2f}' if number > 0 else None


def _building(row):
    geo = row.get('geo')
    if isinstance(geo, str):
        geo = json.loads(geo)
    rings = _rings(geo or {})
    if not rings:
        return None
    kind = row.get('class') or row.get('subtype') or 'yes'
    tags = {'building': kind, 'source': 'overture'}
    for key, tag in (
        ('height', 'height'),
        ('min_height', 'min_height'),
        ('num_floors', 'building:levels'),
    ):
        text = _num(row.get(key))
        if text:
            tags[tag] = text if key != 'num_floors' else str(int(float(text)))
    if row.get('facade_color'):
        tags['building:colour'] = row['facade_color']
    if row.get('roof_color'):
        tags['roof:colour'] = row['roof_color']
    if row.get('roof_shape') in ROOF_SHAPES:
        tags['roof:shape'] = row['roof_shape']
    if row.get('name'):
        tags['name'] = row['name']
    return {'id': _feature_id(row['id']), 'tags': tags, 'rings': rings}


def _road(row):
    if row.get('subtype') != 'road':
        return None
    kind = row.get('class') or ''
    if kind in ('steps', 'unknown', ''):
        return None
    if row.get('subclass') == 'link':
        kind = f'{kind}_link'
    geo = row.get('geo')
    if isinstance(geo, str):
        geo = json.loads(geo)
    rings = _rings(geo or {})
    if not rings:
        return None
    tags = {'highway': kind, 'source': 'overture'}
    if row.get('name'):
        tags['name'] = row['name']
    width = _num(row.get('width'))
    if width:
        tags['width'] = width
    elif kind == 'service':
        tags['width'] = '3'
    elif kind in FOOT:
        tags['width'] = '2'
    flags = row.get('flags') or ''
    if isinstance(flags, str) and 'is_bridge' in flags:
        tags['bridge'] = 'yes'
    if isinstance(flags, str) and 'is_tunnel' in flags:
        tags['tunnel'] = 'yes'
    if row.get('level') not in (None, 0):
        tags['layer'] = str(int(row['level']))
    return {'id': _feature_id(row['id']), 'tags': tags, 'rings': rings}


def _sql(bounds):
    south, west, north, east = bounds
    box = f'bbox.xmin < {east} AND bbox.xmax > {west} AND bbox.ymin < {north} AND bbox.ymax > {south}'
    return f"""
INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial;
SET s3_region='us-west-2';
COPY (
  SELECT id, names.primary AS name, height, min_height, num_floors, class, subtype,
         facade_color, roof_color, roof_shape, NULL::DOUBLE AS width, NULL::INTEGER AS level,
         NULL::VARCHAR AS flags, 'building' AS kind, ST_AsGeoJSON(geometry) AS geo
  FROM read_parquet('{BUILDINGS}', hive_partitioning=1)
  WHERE {box}
  UNION ALL
  SELECT id, names.primary, NULL, NULL, NULL, class, subtype,
         NULL, NULL, NULL,
         width_rules[1].value, level_rules[1].value,
         to_json(road_flags)::VARCHAR, 'road', ST_AsGeoJSON(geometry)
  FROM read_parquet('{SEGMENTS}', hive_partitioning=1)
  WHERE subtype = 'road' AND class NOT IN ('steps', 'unknown') AND {box}
) TO '{{out}}' (FORMAT JSON, ARRAY true);
"""


def fetch(bounds):
    binary = _duckdb()
    if not binary:
        raise RuntimeError('duckdb CLI missing')
    with tempfile.TemporaryDirectory(prefix='overture-') as temporary:
        out = Path(temporary) / 'rows.json'
        sql = _sql(bounds).replace('{out}', out.as_posix())
        subprocess.run([binary, '-c', sql], check=True, timeout=600)
        rows = json.loads(out.read_text())
    features = []
    for row in rows:
        feature = _building(row) if row.get('kind') == 'building' else _road(row)
        if feature:
            features.append(feature)
    return features


def _covers(outer, inner):
    south, west, north, east = inner
    s, w, n, e = outer
    return s <= south and w <= west and n >= north and e >= east


def _intersects(feature, bounds):
    points = [p for ring in feature['rings'] for p in ring['coordinates']]
    if not points:
        return False
    south, west, north, east = bounds
    return (max(p[0] for p in points) >= west and min(p[0] for p in points) <= east and
            max(p[1] for p in points) >= south and min(p[1] for p in points) <= north)


def load(bounds):
    """Features for bounds, or None when Overture cannot be read."""
    path = os.environ.get('OVERTURE_FEATURES')
    if path and Path(path).is_file():
        cached = json.loads(Path(path).read_text())
        if _covers(cached['bounds'], bounds):
            return [_with_publisher_id(f) for f in cached['features'] if _intersects(f, bounds)]
    try:
        return fetch(bounds)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError, RuntimeError, KeyError) as error:
        print('Overture unavailable, keeping OSM buildings and roads:', error, flush=True)
        return None


def apply(features, bounds):
    """Swap OSM buildings and drivable ways for Overture. Lamps stay."""
    extra = load(bounds)
    if extra is None:
        return features
    kept = []
    for feature in features:
        tags = feature.get('tags') or {}
        highway = tags.get('highway')
        if tags.get('building') or tags.get('building:part'):
            continue
        if highway and highway not in ('street_lamp', 'traffic_signals'):
            continue
        kept.append(feature)
    print(f'Overture {RELEASE}: {sum(1 for f in extra if "building" in f["tags"])} buildings, '
          f'{sum(1 for f in extra if "highway" in f["tags"])} roads', flush=True)
    return kept + extra
