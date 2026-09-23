#!/usr/bin/env python3
"""Bounded, reproducible BTA road-area snapshot. No requests from the player browser."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import tempfile
import time
import urllib.parse
import urllib.request

SERVICE = 'https://www.geo.euskadi.eus/geoeuskadi/rest/services/U11/KARTOGRAFIA_CAS/MapServer/59'
CATALOG = 'https://www.geo.euskadi.eus/base-topografica-armonizada-a-escala-1-5-000-de-gobierno-vasco-bta/webgeo00-dataset/es/'
DICTIONARY = 'https://www.geo.euskadi.eus/cartografia/DatosDescarga/Documentacion/BTA/BTA_GV_2022.pdf'
FIELDS = 'OBJECTID,ID_TIPO,SITUACION,ESTADO,COMPONEN2D,CODIGOC'


def request_json(params):
    url = SERVICE + '/query?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={'User-Agent': 'NablaEngine/geoEuskadi-pilot'})
    with urllib.request.urlopen(req, timeout=60) as response:
        data = response.read(16 * 1024 * 1024 + 1)
    if len(data) > 16 * 1024 * 1024:
        raise ValueError('Response exceeds pilot byte budget')
    result = json.loads(data)
    if 'error' in result:
        raise ValueError(f"ArcGIS query failed: {result['error']}")
    return result


def validate_bbox(bbox):
    if len(bbox) != 4 or not all(math.isfinite(x) for x in bbox):
        raise ValueError('Expected finite west,south,east,north')
    w, s, e, n = bbox
    if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        raise ValueError('Invalid WGS84 bounds')
    if e - w > .03 or n - s > .03:
        raise ValueError('Pilot limit is 0.03 degrees per axis; use bulk downloads for regional imports')


def fetch_snapshot(bbox, query=request_json, pause=time.sleep):
    validate_bbox(bbox)
    envelope = dict(f='json', where='1=1', geometry=','.join(map(str, bbox)),
                    geometryType='esriGeometryEnvelope', inSR=4326,
                    spatialRel='esriSpatialRelIntersects', returnIdsOnly='true')

    def identifiers():
        result = query(envelope)
        ids = result.get('objectIds')
        if result.get('exceededTransferLimit') or not isinstance(ids, list):
            raise ValueError('Incomplete object ID snapshot')
        if any(type(i) is not int for i in ids) or len(ids) != len(set(ids)) or len(ids) > 4000:
            raise ValueError('Invalid or excessive object IDs')
        return sorted(ids)

    ids = identifiers()
    found = {}
    for start in range(0, len(ids), 100):
        pause(.25)
        batch = ids[start:start + 100]
        result = query(dict(f='geojson', objectIds=','.join(map(str, batch)), outSR=4326,
                            outFields=FIELDS, returnGeometry='true', returnZ='false', returnM='false'))
        if result.get('exceededTransferLimit') or result.get('type') != 'FeatureCollection':
            raise ValueError('Truncated or invalid feature batch')
        features = result.get('features', [])
        actual = [f.get('properties', {}).get('OBJECTID') for f in features]
        if len(actual) != len(batch) or set(actual) != set(batch):
            raise ValueError('Missing, duplicate or unexpected features')
        for feature in features:
            validate_geometry(feature.get('geometry'))
            found[feature['properties']['OBJECTID']] = feature
    if identifiers() != ids:
        raise ValueError('Dataset changed during import; retry without replacing the previous snapshot')
    return [found[i] for i in ids]


def validate_geometry(geometry):
    if not isinstance(geometry, dict) or geometry.get('type') not in ('Polygon', 'MultiPolygon'):
        raise ValueError('Expected road Polygon/MultiPolygon')
    polygons = geometry.get('coordinates', [])
    if geometry['type'] == 'Polygon':
        polygons = [polygons]
    if not polygons:
        raise ValueError('Empty road geometry')
    for polygon in polygons:
        if not polygon:
            raise ValueError('Empty polygon')
        for ring in polygon:
            if len(ring) < 4 or ring[0] != ring[-1]:
                raise ValueError('Unclosed road ring')
            for point in ring:
                if len(point) != 2 or not all(isinstance(x, (int, float)) and math.isfinite(x) for x in point):
                    raise ValueError('Expected finite XY coordinates')
                if not (-180 <= point[0] <= 180 and -90 <= point[1] <= 90):
                    raise ValueError('Coordinates are not WGS84 longitude/latitude')


def make_artifact(bbox, features):
    payload = json.dumps(features, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
    revision = hashlib.sha256(payload).hexdigest()
    return dict(schemaVersion=1, provider='geoeuskadi', dataset='bta5-road-areas-59',
                revision=revision, recipe='road-area-audit-v1', crs='EPSG:4326', bbox=bbox,
                retrievedAt=datetime.now(timezone.utc).isoformat(), complete=True,
                source=SERVICE, catalog=CATALOG, dictionary=DICTIONARY,
                attribution='Eusko Jaurlaritza / Gobierno Vasco. geoEuskadi. Adapted by Nabla.',
                license='CC-BY-4.0', features=features)


def atomic_write(path, artifact):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as f:
        temp = Path(f.name)
        try:
            json.dump(artifact, f, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
            f.flush()
        except BaseException:
            temp.unlink(missing_ok=True)
            raise
    try:
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--bbox', default='-1.825,43.325,-1.81,43.335')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    bbox = list(map(float, args.bbox.split(',')))
    artifact = make_artifact(bbox, fetch_snapshot(bbox))
    atomic_write(args.output, artifact)
    print(f"Saved {len(artifact['features'])} complete road features; revision {artifact['revision'][:12]}")


if __name__ == '__main__':
    main()
