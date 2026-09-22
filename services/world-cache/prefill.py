#!/usr/bin/env python3
"""
Pre-fill the world-cache with zones for a region (Irun by default).

This warms the cache so users driving through the region hit cache instead of
live Overpass. Run on chained.world where world-cache is deployed.

Usage:
    # Default: 10x10 grid around Irun Ventas (120 zones)
    python3 prefill.py

    # Custom region: 20x20 grid around Madrid
    python3 prefill.py --lat 40.4168 --lon -3.7038 --radius 10

    # Dry run (show what would be fetched)
    python3 prefill.py --dry-run

    # Custom cache URL
    python3 prefill.py --cache-url http://127.0.0.1:8787
"""
import argparse
import json
import math
import sys
import time
import urllib.request
import urllib.error

EARTH_RADIUS = 6371000
ZONE_SIZE = 1200

IRUN_VENTAS = (43.32969, -1.819606, 28.253)

def geo_offset(origin, dx_m, dz_m):
    """Convert metre offsets to geographic coordinates."""
    lat, lon, alt = origin
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

def fetch_zone(cache_url, origin, x, z, dry_run=False):
    """Fetch a zone through the cache."""
    bounds = zone_bounds(origin, x, z)
    query = overpass_query(bounds)
    
    if dry_run:
        print(f"  Would fetch zone ({x}, {z}): bbox={bounds[0]:.4f},{bounds[1]:.4f},{bounds[2]:.4f},{bounds[3]:.4f}")
        return 'dry-run', 0
    
    url = f"{cache_url}/osm"
    data = urllib.parse.urlencode({'data': query}).encode()
    request = urllib.request.Request(url, data=data, method='POST')
    request.add_header('Content-Type', 'application/x-www-form-urlencoded')
    
    start = time.time()
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.loads(response.read())
            elapsed = time.time() - start
            cache_status = response.headers.get('X-Nabla-Cache', 'UNKNOWN')
            elements = len(result.get('elements', []))
            return cache_status, elapsed, elements
    except urllib.error.HTTPError as e:
        return f'ERROR-{e.code}', time.time() - start, 0
    except Exception as e:
        return f'ERROR', time.time() - start, 0

def main():
    parser = argparse.ArgumentParser(description='Pre-fill world-cache for a region')
    parser.add_argument('--lat', type=float, default=IRUN_VENTAS[0], help='Origin latitude')
    parser.add_argument('--lon', type=float, default=IRUN_VENTAS[1], help='Origin longitude')
    parser.add_argument('--alt', type=float, default=IRUN_VENTAS[2], help='Origin altitude')
    parser.add_argument('--radius', type=int, default=5, help='Grid radius (zones in each direction)')
    parser.add_argument('--cache-url', default='http://127.0.0.1:8080', help='Cache service URL')
    parser.add_argument('--dry-run', action='store_true', help='Show what would be fetched')
    parser.add_argument('--delay', type=float, default=0.5, help='Delay between requests (seconds)')
    args = parser.parse_args()
    
    origin = (args.lat, args.lon, args.alt)
    total = (2 * args.radius + 1) ** 2
    
    print(f"Pre-filling cache for {total} zones around ({args.lat:.4f}, {args.lon:.4f})")
    print(f"Grid: {-args.radius} to {args.radius} in X and Z (radius={args.radius})")
    print(f"Cache URL: {args.cache_url}")
    if args.dry_run:
        print("DRY RUN - no actual requests")
    print()
    
    stats = {'HIT': 0, 'MISS': 0, 'STALE': 0, 'ERROR': 0}
    done = 0
    
    for x in range(-args.radius, args.radius + 1):
        for z in range(-args.radius, args.radius + 1):
            done += 1
            key = f"{x}_{z}"
            result = fetch_zone(args.cache_url, origin, x, z, args.dry_run)
            
            if args.dry_run:
                continue
            
            status, elapsed, elements = result
            category = 'HIT' if status == 'HIT' else 'MISS' if status == 'MISS' else 'STALE' if status == 'STALE' else 'ERROR'
            stats[category] += 1
            
            print(f"[{done}/{total}] Zone {key}: {status} ({elapsed:.1f}s, {elements} elements)")
            
            if category == 'MISS' and args.delay > 0:
                time.sleep(args.delay)
    
    if not args.dry_run:
        print()
        print(f"Done! HIT={stats['HIT']} MISS={stats['MISS']} STALE={stats['STALE']} ERROR={stats['ERROR']}")

if __name__ == '__main__':
    import urllib.parse
    main()
