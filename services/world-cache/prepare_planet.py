"""Fetch one native XYZ source. No legacy grid, scene origin or relocation is accepted.

Run explicitly on the owner's server; this does not expose a public generation API.
The Node publisher loads elevation and commits content-addressed GLBs atomically.
"""
import argparse
import json
import math
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from osm_source import overpass_query, overpass_features
from baked_format import atomic_write


def tile_bounds(address):
    match = re.fullmatch(r'z/(13|14|15)/(0|[1-9]\d*)/(0|[1-9]\d*)', address)
    if not match:
        raise ValueError('Expected canonical z/zoom/x/y (zoom 13, 14 or 15)')
    z, x, y = map(int, match.groups())
    n = 2 ** z
    if x >= n or y >= n:
        raise ValueError('Tile outside WebMercatorQuad')
    latitude = lambda row: math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * row / n))))
    return dict(z=z, x=x, y=y), (latitude(y+1), x/n*360-180, latitude(y), (x+1)/n*360-180)


def intersects(feature, bounds):
    coordinates = [p for ring in feature['rings'] for p in ring['coordinates']]
    if not coordinates:
        return False
    south, west, north, east = bounds
    return (max(p[0] for p in coordinates) >= west and min(p[0] for p in coordinates) <= east and
            max(p[1] for p in coordinates) >= south and min(p[1] for p in coordinates) <= north)


def prepare(address, output, cache_base, publisher):
    from datetime import datetime, timezone
    tile, bounds = tile_bounds(address)
    # Neighbouring zooms/cells reuse one upstream request, keyed by their z13 ancestor.
    scale = 2 ** (tile['z'] - 13)
    _, query_bounds = tile_bounds(f"z/13/{tile['x']//scale}/{tile['y']//scale}")
    query = overpass_query(query_bounds)
    request = urllib.request.Request(cache_base.rstrip('/') + '/osm',
        data=urllib.parse.urlencode({'data': query}).encode(),
        headers={'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'NablaPlanet/1.0'})
    with urllib.request.urlopen(request, timeout=120) as response:
        raw = response.read(64 * 1024 * 1024 + 1)
        if len(raw) > 64 * 1024 * 1024:
            raise ValueError('OSM source exceeds budget')
        data = json.loads(raw)
    if data.get('remark') or not isinstance(data.get('elements'), list):
        raise ValueError('Incomplete OSM source')
    source = dict(format='nabla-planet-source-v1', tile=tile,
        retrievedAt=datetime.now(timezone.utc).isoformat(),
        elevation=dict(segments=128 if tile['z'] == 15 else 64, heights=[], provider='esri-terrain-3d'),
        features=[f for f in overpass_features(data['elements']) if intersects(f, bounds)])
    with tempfile.TemporaryDirectory(prefix='nabla-planet-') as temporary:
        path = Path(temporary) / 'source.json'
        atomic_write(path, source)
        subprocess.run(['node', '--max-old-space-size=768', str(publisher), str(path), str(output),
                        cache_base.rstrip('/') + '/elevation'], check=True, timeout=600)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('address', help='For example z/15/16218/11997')
    parser.add_argument('output', type=Path)
    parser.add_argument('--cache-base', required=True)
    parser.add_argument('--publisher', type=Path,
                        default=Path('/app/prepare-dist/services/world-cache/prepare-planet.js'))
    args = parser.parse_args()
    prepare(args.address, args.output, args.cache_base, args.publisher)
