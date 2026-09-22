#!/usr/bin/env python3
"""
Bake zone JSON for a region, producing files the client can consume directly.

This creates pre-computed WorldExtract JSON files that bypass live Overpass entirely.
Baked zones are served with priority over demand-cached responses.

Usage:
    # Default: 11x11 grid around Irun Ventas
    python3 bake.py

    # Custom region
    python3 bake.py --lat 40.4168 --lon -3.7038 --radius 10 --name "Madrid"

    # Output to custom directory
    python3 bake.py --output /data/baked

    # Use existing cache for faster bake (requires running cache service)
    python3 bake.py --cache-url http://127.0.0.1:8080

The baked files are placed in:
    <output>/zones/<lat>/<lon>/<x>_<z>.json

The cache server serves these at:
    GET /baked/<lat>/<lon>/<x>_<z>
"""
import argparse
import json
import math
import os
import sys
import time
import urllib.request
import urllib.error

EARTH_RADIUS = 6371000
ZONE_SIZE = 1200

IRUN_VENTAS = {
    'name': 'Irún · Ventas / Katea',
    'latitude': 43.32969,
    'longitude': -1.819606,
    'altitude': 28.253
}

def geo_offset(origin, dx_m, dz_m):
    """Convert metre offsets to geographic coordinates."""
    lat, lon = origin['latitude'], origin['longitude']
    new_lat = lat - (dz_m / EARTH_RADIUS) * (180 / math.pi)
    new_lon = lon + (dx_m / (EARTH_RADIUS * math.cos(lat * math.pi / 180))) * (180 / math.pi)
    return (new_lat, new_lon)

def overpass_query(bounds):
    """Generate Overpass query for a zone."""
    s, w, n, e = bounds
    return f'[out:json][timeout:25];(way[building]({s},{w},{n},{e});way["building:part"]({s},{w},{n},{e});way[highway]({s},{w},{n},{e});relation[building]({s},{w},{n},{e});node[natural=tree]({s},{w},{n},{e}););out geom;'

def zone_bounds(origin, x, z):
    """Get geographic bounds for zone (x, z) centered on origin."""
    ox, oz = x * ZONE_SIZE, z * ZONE_SIZE
    nw = geo_offset(origin, ox - 750, oz - 750)
    se = geo_offset(origin, ox + 750, oz + 750)
    return (se[0], nw[1], nw[0], se[1])

def overpass_features(elements):
    """Convert Overpass elements to MapFeature format (matches client's overpassFeatures)."""
    result = []
    members = set()
    
    def coordinates(g):
        return [[p['lon'], p['lat']] for p in g]
    
    def closed(g):
        return len(g) >= 4 and g[0]['lat'] == g[-1]['lat'] and g[0]['lon'] == g[-1]['lon']
    
    for e in elements:
        if e.get('type') == 'relation' and e.get('members'):
            ways = [m for m in e['members'] if m.get('type') == 'way']
            if not ways or any(not m.get('geometry') or not closed(m['geometry']) for m in ways):
                continue
            result.append({
                'id': f"relation/{e['id']}",
                'tags': e.get('tags', {}),
                'rings': [{'role': m.get('role') or 'outer', 'coordinates': coordinates(m['geometry'])} for m in ways]
            })
            for m in ways:
                members.add(m['ref'])
    
    for e in elements:
        if e.get('type') == 'way' and e.get('geometry') and e['id'] not in members:
            tags = e.get('tags', {})
            if (tags.get('building') or tags.get('building:part')) and not closed(e['geometry']):
                continue
            result.append({
                'id': f"way/{e['id']}",
                'tags': tags,
                'rings': [{'role': 'outer', 'coordinates': coordinates(e['geometry'])}]
            })
        elif e.get('type') == 'node' and e.get('tags', {}).get('natural') == 'tree':
            if e.get('lat') is not None and e.get('lon') is not None:
                result.append({
                    'id': f"node/{e['id']}",
                    'tags': e.get('tags', {}),
                    'rings': [{'role': 'point', 'coordinates': [[e['lon'], e['lat']]]}]
                })
    
    return result

def fetch_osm(origin, x, z, cache_url=None):
    """Fetch OSM data for a zone, optionally through cache."""
    bounds = zone_bounds(origin, x, z)
    query = overpass_query(bounds)
    
    if cache_url:
        url = f"{cache_url}/osm"
    else:
        url = "https://overpass-api.de/api/interpreter"
    
    data = urllib.parse.urlencode({'data': query}).encode()
    request = urllib.request.Request(url, data=data, method='POST')
    request.add_header('Content-Type', 'application/x-www-form-urlencoded')
    request.add_header('User-Agent', 'NablaBake/1.0')
    
    with urllib.request.urlopen(request, timeout=120) as response:
        result = json.loads(response.read())
        if 'remark' in result or not isinstance(result.get('elements'), list):
            raise ValueError('Incomplete OSM response')
        return result['elements']

def fetch_elevation(origin, x, z, cache_url=None):
    """Fetch elevation grid for a zone. Returns 121x121 heights."""
    ox, oz = x * ZONE_SIZE, z * ZONE_SIZE
    spacing = 10
    
    samples = []
    for i in range(121 * 121):
        sx = ox + (i % 121) * spacing - 60 * spacing
        sz = oz + (i // 121) * spacing - 60 * spacing
        lat, lon = geo_offset(origin, sx, sz)
        
        tile_x = int((lon + 180) / 360 * (1 << 12))
        tile_y = int((1 - math.log(math.tan(lat * math.pi / 180) + 1 / math.cos(lat * math.pi / 180)) / math.pi) / 2 * (1 << 12))
        
        samples.append({'lat': lat, 'lon': lon, 'tile_x': tile_x, 'tile_y': tile_y, 'i': i})
    
    # For baking, we use a simplified elevation (the client will re-fetch from Esri anyway)
    # This allows baking without Esri credentials. Set all heights to origin altitude offset.
    # Real elevation comes from the terrain field when the client loads.
    return [0.0] * (121 * 121)

def bake_zone(origin, x, z, name, cache_url=None):
    """Create a WorldExtract for a zone."""
    print(f"  Fetching OSM for zone ({x}, {z})...")
    elements = fetch_osm(origin, x, z, cache_url)
    features = overpass_features(elements)
    
    print(f"  Got {len(features)} features")
    
    # Note: elevation is stubbed. The client fetches real elevation from Esri.
    # The baked file provides OSM features; elevation is separate.
    heights = fetch_elevation(origin, x, z, cache_url)
    
    return {
        'name': name,
        'origin': {
            'latitude': origin['latitude'],
            'longitude': origin['longitude'],
            'altitude': origin['altitude']
        },
        'terrain': {
            'columns': 121,
            'rows': 121,
            'spacing': 10,
            'heights': heights
        },
        'features': features,
        'source': {
            'retrievedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'baked': True,
            'osm': 'overpass-api.de' if not cache_url else cache_url
        }
    }

def main():
    parser = argparse.ArgumentParser(description='Bake zone JSON for a region')
    parser.add_argument('--lat', type=float, default=IRUN_VENTAS['latitude'])
    parser.add_argument('--lon', type=float, default=IRUN_VENTAS['longitude'])
    parser.add_argument('--alt', type=float, default=IRUN_VENTAS['altitude'])
    parser.add_argument('--name', default=IRUN_VENTAS['name'])
    parser.add_argument('--radius', type=int, default=5, help='Grid radius')
    parser.add_argument('--output', default='./data/baked', help='Output directory')
    parser.add_argument('--cache-url', help='Use cache service for faster bake')
    parser.add_argument('--delay', type=float, default=1.0, help='Delay between zones (public Overpass)')
    parser.add_argument('--skip-existing', action='store_true', help='Skip zones that already exist')
    args = parser.parse_args()
    
    origin = {'latitude': args.lat, 'longitude': args.lon, 'altitude': args.alt}
    total = (2 * args.radius + 1) ** 2
    
    # Create output directory structure
    zone_dir = os.path.join(args.output, f"{args.lat:.5f}", f"{args.lon:.5f}")
    os.makedirs(zone_dir, exist_ok=True)
    
    print(f"Baking {total} zones for {args.name}")
    print(f"Origin: ({args.lat}, {args.lon}, {args.alt})")
    print(f"Output: {zone_dir}")
    if args.cache_url:
        print(f"Using cache: {args.cache_url}")
    print()
    
    done = 0
    skipped = 0
    errors = 0
    
    for x in range(-args.radius, args.radius + 1):
        for z in range(-args.radius, args.radius + 1):
            done += 1
            key = f"{x}_{z}"
            path = os.path.join(zone_dir, f"{key}.json")
            
            if args.skip_existing and os.path.exists(path):
                print(f"[{done}/{total}] Zone {key}: SKIPPED (exists)")
                skipped += 1
                continue
            
            print(f"[{done}/{total}] Zone {key}:")
            try:
                extract = bake_zone(origin, x, z, args.name, args.cache_url)
                with open(path, 'w') as f:
                    json.dump(extract, f, separators=(',', ':'))
                size_kb = os.path.getsize(path) / 1024
                print(f"  Wrote {path} ({size_kb:.1f} KB)")
            except Exception as e:
                print(f"  ERROR: {e}")
                errors += 1
            
            if not args.cache_url and args.delay > 0:
                time.sleep(args.delay)
    
    print()
    print(f"Done! Baked={done - skipped - errors} Skipped={skipped} Errors={errors}")
    print(f"Files in: {zone_dir}")

if __name__ == '__main__':
    import urllib.parse
    main()
