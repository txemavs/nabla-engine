"""Prepare the user-supplied Wrangler: metres, Y-up, -Z forward, shared wheels.
Usage: python3 scripts/prepare-wrangler.py /path/to/jeep_wrangler.glb
No decimation: merge equal materials and omit unused UV channels (no textures).
"""
import copy
import json
import struct
import sys
from pathlib import Path

source = Path(sys.argv[1]).read_bytes()
length = struct.unpack_from('<I', source, 12)[0]
doc = json.loads(source[20:20 + length])
binary = source[28 + length:]
assert len(doc['meshes']) == 44 and not doc.get('textures'), 'Unexpected source model'


def values(index):
    a = doc['accessors'][index]
    v = doc['bufferViews'][a['bufferView']]
    size = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    fmt = '<' + {5126: 'f', 5125: 'I', 5123: 'H', 5121: 'B'}[a['componentType']] * size
    stride = v.get('byteStride', struct.calcsize(fmt))
    offset = v.get('byteOffset', 0) + a.get('byteOffset', 0)
    return [struct.unpack_from(fmt, binary, offset + i * stride) for i in range(a['count'])]


def export(name, selected, center):
    groups = {}
    for i in selected:
        for p in doc['meshes'][i]['primitives']:
            assert p.get('mode', 4) == 4
            positions, normals, indices = groups.setdefault(p['material'], ([], [], []))
            base = len(positions)
            positions.extend((-x, z, y - center) for x, y, z in values(p['attributes']['POSITION']))
            normals.extend((-x, z, y) for x, y, z in values(p['attributes']['NORMAL']))
            indices.extend(base + index[0] for index in values(p['indices']))
    out = {'asset': copy.deepcopy(doc['asset']), 'scene': 0, 'scenes': [{'nodes': []}],
           'nodes': [], 'meshes': [], 'materials': [], 'accessors': [], 'bufferViews': []}
    out['asset']['generator'] = 'Nabla prepare-wrangler.py (material merge, rigid axis conversion)'
    data = bytearray()

    def accessor(items, kind, component):
        while len(data) % 4:
            data.append(0)
        start = len(data)
        flat = items if kind == 'SCALAR' else [v for item in items for v in item]
        data.extend(struct.pack('<' + ('I' if component == 5125 else 'f') * len(flat), *flat))
        view = len(out['bufferViews'])
        out['bufferViews'].append({'buffer': 0, 'byteOffset': start, 'byteLength': len(data) - start})
        a = {'bufferView': view, 'componentType': component, 'count': len(items), 'type': kind}
        if kind == 'VEC3':
            a.update(min=[min(v[i] for v in items) for i in range(3)],
                     max=[max(v[i] for v in items) for i in range(3)])
        out['accessors'].append(a)
        return len(out['accessors']) - 1

    for material, (positions, normals, indices) in groups.items():
        i = len(out['meshes'])
        out['materials'].append(copy.deepcopy(doc['materials'][material]))
        out['meshes'].append({'name': doc['materials'][material]['name'], 'primitives': [{
            'attributes': {'POSITION': accessor(positions, 'VEC3', 5126),
                           'NORMAL': accessor(normals, 'VEC3', 5126)},
            'indices': accessor(indices, 'SCALAR', 5125), 'material': i}]})
        out['nodes'].append({'name': doc['materials'][material]['name'], 'mesh': i})
        out['scenes'][0]['nodes'].append(i)
    out['buffers'] = [{'byteLength': len(data)}]
    payload = json.dumps(out, separators=(',', ':')).encode()
    payload += b' ' * (-len(payload) % 4)
    data += b'\0' * (-len(data) % 4)
    target = Path(__file__).resolve().parents[1] / 'assets/world' / name
    target.write_bytes(struct.pack('<III', 0x46546c67, 2, 28 + len(payload) + len(data)) +
                       struct.pack('<II', len(payload), 0x4e4f534a) + payload +
                       struct.pack('<II', len(data), 0x004e4942) + data)
    print(name, len(groups), 'draws,', sum(len(v[2]) // 3 for v in groups.values()), 'triangles,', target.stat().st_size, 'bytes')


export('car.jeep.wrangler.glb', [0, *range(6, 44)], 0.5227255)
export('car.jeep.wrangler.wheel.glb', range(1, 6), 0)
