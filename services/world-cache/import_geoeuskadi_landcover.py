#!/usr/bin/env python3
"""Snapshot BTA land-use polygons together with their published legend colours."""
import argparse
import json
import hashlib
import urllib.request
import import_geoeuskadi as roads


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--bbox', default='-1.825,43.325,-1.81,43.335')
    args = parser.parse_args()
    roads.SERVICE = roads.SERVICE.rsplit('/', 1)[0] + '/11'
    roads.FIELDS = 'OBJECTID,LEYENDA_1'
    with urllib.request.urlopen(roads.SERVICE + '?f=json', timeout=60) as response:
        layer = json.load(response)
    renderer = layer['drawingInfo']['renderer']
    if renderer.get('field1') != 'LEYENDA_1':
        raise ValueError('Unrecognized land-use renderer')
    colors = {}
    for item in renderer['uniqueValueInfos']:
        color = item['symbol']['color']
        if len(color) != 4 or color[3] != 255:
            raise ValueError('Expected opaque palette')
        colors[item['value']] = '#' + ''.join(f'{c:02x}' for c in color[:3])
    bbox = list(map(float, args.bbox.split(',')))
    features = roads.fetch_snapshot(bbox)
    if any(f['properties'].get('LEYENDA_1') not in colors for f in features):
        raise ValueError('Unmapped land-use category; refusing partial styling')
    artifact = roads.make_artifact(bbox, features)
    artifact['revision'] = hashlib.sha256(json.dumps({'features': features, 'colors': colors}, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()
    artifact.update(dataset='bta5-land-use-11', recipe='land-use-palette-v1', colors=colors)
    roads.atomic_write(args.output, artifact)
    print(f'Saved {len(features)} land-use polygons and {len(colors)} legend colours')


if __name__ == '__main__':
    main()
