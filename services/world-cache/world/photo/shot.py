"""Read a cell's GLBs and write preview.jpg. No network, no WebGL."""
import hashlib
import json
import math
import struct
from pathlib import Path

from PIL import Image, ImageDraw

EARTH_RADIUS = 6371000
SIZE = 256
# Sampled from the orthophoto water the map should match.
SEA = (3, 55, 76)


def _vivid_green(red, green, blue):
    """First pass. Kept so cells already rewritten can be undone."""
    return (
        min(255, int(red * 2.8 + 48)),
        min(255, int(green * 2.4 + 62)),
        min(255, int(blue * 1.6 + 16)),
    )


def _undo_vivid(colour):
    """Invert orthophoto-v1. Water stays. Anything that was not lifted stays."""
    if colour == SEA:
        return colour
    red, green, blue = colour
    raw = ((red - 48) / 2.8, (green - 62) / 2.4, (blue - 16) / 1.6)
    if all(0 <= channel <= 255 for channel in raw):
        source = tuple(int(round(channel)) for channel in raw)
        if source[1] > source[0] and source[1] >= source[2] and source[1] - source[2] > 4:
            if all(abs(a - b) <= 1 for a, b in zip(_vivid_green(*source), colour)):
                return source
    raw = ((red - 32) / 1.15, (green - 26) / 1.15, (blue - 14) / 1.05)
    if all(0 <= channel <= 255 for channel in raw):
        source = tuple(int(round(channel)) for channel in raw)
        if source[0] > source[2] + 12 and source[1] > source[2]:
            lifted = (
                min(255, int(source[0] * 1.15 + 32)),
                min(255, int(source[1] * 1.15 + 26)),
                min(255, int(source[2] * 1.05 + 14)),
            )
            if all(abs(a - b) <= 1 for a, b in zip(lifted, colour)):
                return source
    return colour


def _muted_green(red, green, blue):
    raised = (red * 1.4 + 58, green * 1.5 + 52, blue * 1.3 + 46)
    luma = 0.30 * raised[0] + 0.55 * raised[1] + 0.15 * raised[2]
    return tuple(min(255, int(luma + (channel - luma) * 0.42)) for channel in raised)


def _undo_muted(colour):
    """Invert the gray-olive pass. Leaves water and colours that were not muted."""
    if colour == SEA:
        return colour
    red, green, blue = colour
    # out = 0.58 * luma + 0.42 * raised, luma = 0.30 r + 0.55 g + 0.15 b
    raised = (
        1.966667 * red - 0.759524 * green - 0.207143 * blue,
        -0.414286 * red + 1.621429 * green - 0.207143 * blue,
        -0.414286 * red - 0.759524 * green + 2.173810 * blue,
    )
    source = ((raised[0] - 58) / 1.4, (raised[1] - 52) / 1.5, (raised[2] - 46) / 1.3)
    if not all(-0.5 <= channel <= 255.5 for channel in source):
        return colour
    origin = tuple(min(255, max(0, int(round(channel)))) for channel in source)
    if origin[1] > origin[0] and origin[1] >= origin[2] and origin[1] - origin[2] > 4:
        if all(abs(a - b) <= 1 for a, b in zip(_muted_green(*origin), colour)):
            return origin
    return colour


def _like_orthophoto(colour):
    """Halfway between the neon green and the gray olive."""
    red, green, blue = colour
    if green > red and green >= blue and green - blue > 4:
        return tuple((a + b) // 2 for a, b in zip(_vivid_green(red, green, blue), _muted_green(red, green, blue)))
    if red > blue + 12 and green > blue:
        return (
            min(255, int(red * 1.15 + 32)),
            min(255, int(green * 1.15 + 26)),
            min(255, int(blue * 1.05 + 14)),
        )
    return colour


def tile_span(z, y):
    """Width of the cell in metres at its centre latitude. +X east, +Z south."""
    n = 2 ** z
    latitude = math.atan(math.sinh(math.pi * (1 - 2 * (y + 0.5) / n)))
    return (2 * math.pi * EARTH_RADIUS / n) * math.cos(latitude)


def _accessor(gltf, binary, index):
    accessor = gltf['accessors'][index]
    view = gltf['bufferViews'][accessor['bufferView']]
    start = view.get('byteOffset', 0) + accessor.get('byteOffset', 0)
    count = accessor['count']
    kind = accessor['type']
    components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[kind]
    fmt = {5121: 'B', 5123: 'H', 5125: 'I', 5126: 'f'}[accessor['componentType']]
    width = struct.calcsize(fmt)
    stride = view.get('byteStride') or components * width
    values = []
    for i in range(count):
        offset = start + i * stride
        values.append(struct.unpack_from('<' + fmt * components, binary, offset))
    return values


def _matrix(node):
    if 'matrix' in node:
        m = node['matrix']
        # glTF stores a column-major matrix. Keep it as rows.
        return tuple(tuple(m[col * 4 + row] for col in range(4)) for row in range(4))
    tx, ty, tz = node.get('translation', (0, 0, 0))
    rx, ry, rz, rw = node.get('rotation', (0, 0, 0, 1))
    sx, sy, sz = node.get('scale', (1, 1, 1))
    xx, yy, zz = rx * rx, ry * ry, rz * rz
    xy, xz, yz = rx * ry, rx * rz, ry * rz
    wx, wy, wz = rw * rx, rw * ry, rw * rz
    return (
        ((1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0),
        (2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0),
        (2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0),
        (tx, ty, tz, 1),
    )


def _mul(a, b):
    return tuple(
        tuple(sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4))
        for i in range(4)
    )


def _apply(matrix, point):
    x, y, z = point
    return tuple(matrix[row][0] * x + matrix[row][1] * y + matrix[row][2] * z + matrix[row][3] for row in range(3))


def _srgb(channel):
    """Linear 0–1 to sRGB 0–1. The publisher stores COLOR_0 in linear."""
    channel = max(0.0, min(1.0, channel))
    if channel <= 0.0031308:
        return 12.92 * channel
    return 1.055 * (channel ** (1 / 2.4)) - 0.055


# Status page orbit view: HemisphereLight('#ffffff', '#3a4030', 1.2) and
# DirectionalLight('#ffffff', 1.6) from (300, 800, 200). Upward faces take the
# sky. MeshStandard Lambert divides by pi. A general light, same brightness.
_SUN_Y = 800 / math.sqrt(300 * 300 + 800 * 800 + 200 * 200)
VIEW_LIGHT = (1.2 + 1.6 * _SUN_Y) / math.pi


def triangles(path):
    """World-space triangles (height, corners, colour) from one GLB. Textures are ignored."""
    data = Path(path).read_bytes()
    if data[:4] != b'glTF':
        raise ValueError('Not a GLB')
    offset = 12
    gltf = None
    binary = b''
    while offset + 8 <= len(data):
        chunk_length, chunk_kind = struct.unpack_from('<I4s', data, offset)
        chunk = data[offset + 8:offset + 8 + chunk_length]
        if chunk_kind == b'JSON':
            gltf = json.loads(chunk)
        elif chunk_kind == b'BIN\x00':
            binary = chunk
        offset += 8 + chunk_length
    identity = ((1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 1, 0), (0, 0, 0, 1))
    found = []

    def walk(node_index, parent):
        node = gltf['nodes'][node_index]
        local = _mul(parent, _matrix(node))
        extras = node.get('extras') or {}
        category = extras.get('category') or ''
        # landcover.ts: water is ground layer 11. The label is the river name, not the word "water".
        water_mesh = extras.get('groundLayer') == 11
        mesh_index = node.get('mesh')
        if mesh_index is not None:
            for primitive in gltf['meshes'][mesh_index]['primitives']:
                if primitive.get('mode', 4) != 4:
                    continue
                attrs = primitive.get('attributes') or {}
                if 'POSITION' not in attrs:
                    continue
                points = [_apply(local, p) for p in _accessor(gltf, binary, attrs['POSITION'])]
                material = gltf.get('materials', [{}])[primitive.get('material', 0)] if gltf.get('materials') else {}
                factor = (material.get('pbrMetallicRoughness') or {}).get('baseColorFactor', (1, 1, 1, 1))
                tint = tuple(max(0.0, min(1.0, c)) for c in factor[:3])
                painted = _accessor(gltf, binary, attrs['COLOR_0']) if 'COLOR_0' in attrs else None
                if 'indices' in primitive:
                    indices = [i[0] for i in _accessor(gltf, binary, primitive['indices'])]
                else:
                    indices = list(range(len(points)))
                for i in range(0, len(indices) - 2, 3):
                    corners = [indices[i], indices[i + 1], indices[i + 2]]
                    tri = [points[index] for index in corners]
                    if painted:
                        rgb = tuple(sum(painted[index][channel] for index in corners) / 3 for channel in range(3))
                        # glTF stores byte colours 0–255 and float colours 0–1.
                        if max(rgb) > 1:
                            rgb = tuple(channel / 255 for channel in rgb)
                    else:
                        rgb = (0.55, 0.6, 0.45)
                    # COLOR_0 is linear. Light it like the status page, then store sRGB.
                    colour = tuple(
                        int(_srgb(rgb[channel] * tint[channel] * VIEW_LIGHT) * 255) for channel in range(3)
                    )
                    if category == 'Roads':
                        rank = 3
                    elif water_mesh:
                        rank = 2
                    elif category in ('Terrain', 'Skirt', ''):
                        rank = 0
                    else:
                        rank = 1
                    found.append((rank, sum(p[1] for p in tri) / 3, tri, colour))
        for child in node.get('children', ()):
            walk(child, local)

    for root in gltf['scenes'][gltf.get('scene', 0)].get('nodes', ()):
        walk(root, identity)
    return found


def render(cell, z, y, sources):
    """Orthographic JPEG. North is up. Higher triangles paint over lower ones."""
    span = tile_span(z, y)
    image = Image.new('RGB', (SIZE, SIZE), (28, 36, 32))
    draw = ImageDraw.Draw(image)
    faces = []
    for layer, source in enumerate(sources):
        faces.extend((layer, *face) for face in triangles(source))
    faces.sort()

    def pixel(x, z_south):
        return (
            (x / span + 0.5) * (SIZE - 1),
            (z_south / span + 0.5) * (SIZE - 1),
        )

    for _, _, _, tri, colour in faces:
        draw.polygon([pixel(p[0], p[2]) for p in tri], fill=colour)
    target = Path(cell) / 'preview.jpg'
    temporary = target.with_suffix('.jpg.tmp')
    image.save(temporary, 'JPEG', quality=80)
    temporary.replace(target)
    return target


# orthophoto-v3 was a wash applied after publish. It is not a palette to choose.
# The colours are SURFACE_COLORS in src/landcover.ts, baked at prepare time into
# the GLB and then into preview.jpg. Pick them before generating the planet.
# A later change needs a new prepare of every cell. Repainting vertices is lossy
# and leaves the old JPEG and the old S3 object in place.
PALETTE = 'orthophoto-v3'
SOURCE = 'source'
# The publisher's own colours. A washed value can come from a few nearby sources.
KNOWN = {
    (97, 126, 67), (196, 184, 164), (168, 168, 152), (176, 154, 110),
    (70, 98, 66), (92, 119, 71), (74, 108, 84), (120, 122, 107), (201, 184, 146),
}


def _wash_inverse():
    """Map a washed colour back to the source colour. Built once."""
    table = {}
    for red in range(256):
        for green in range(256):
            for blue in range(256):
                source = (red, green, blue)
                washed = _like_orthophoto(source)
                if washed == source:
                    continue
                table.setdefault(washed, []).append(source)
    chosen = {}
    for washed, sources in table.items():
        known = [item for item in sources if item in KNOWN]
        chosen[washed] = known[0] if known else min(sources, key=sum)
    return chosen


_INVERSE = None


def _restore_vertex(rgb):
    """rgb is 0–1. Colours the wash did not touch stay as they are."""
    global _INVERSE
    if _INVERSE is None:
        _INVERSE = _wash_inverse()
    colour = tuple(int(round(max(0, min(1, channel)) * 255)) for channel in rgb[:3])
    source = _INVERSE.get(colour)
    if source is None:
        return None
    return tuple(channel / 255 for channel in source)


def _recolor_vertex(rgb, height, water, terrain, roads, previous):
    """rgb is 0–1. Water stays the orthophoto blue. Land sits between neon and gray."""
    channels = tuple(int(max(0, min(1, channel)) * 255) for channel in rgb[:3])
    if previous in ('orthophoto-v1', 'orthophoto-v2'):
        channels = _undo_vivid(channels)
    if previous == 'orthophoto-v2':
        channels = _undo_muted(channels)
    if water or (terrain and height <= 1) or channels == SEA:
        return tuple(channel / 255 for channel in SEA)
    if roads:
        return tuple(max(0, min(255, int(channel * 0.78))) / 255 for channel in channels)
    lifted = _like_orthophoto(channels)
    return tuple(channel / 255 for channel in lifted)


def restore(cell, manifest):
    """Put the publisher colours back. The washed file keeps its old name in the bucket."""
    if manifest.get('palette') != PALETTE:
        return False
    cell = Path(cell)
    for layer in ('terrain', 'buildings-osm'):
        described = manifest['files'][layer]
        path = cell / described['path']
        data = bytearray(path.read_bytes())
        if data[:4] != b'glTF':
            continue
        offset = 12
        gltf = None
        binary_at = None
        while offset + 8 <= len(data):
            chunk_length, chunk_kind = struct.unpack_from('<I4s', data, offset)
            if chunk_kind == b'JSON':
                gltf = json.loads(data[offset + 8:offset + 8 + chunk_length])
            elif chunk_kind == b'BIN\x00':
                binary_at = offset + 8
            offset += 8 + chunk_length
        if gltf is None or binary_at is None:
            continue

        def repaint(node_index):
            node = gltf['nodes'][node_index]
            mesh_index = node.get('mesh')
            if mesh_index is not None:
                for primitive in gltf['meshes'][mesh_index]['primitives']:
                    attrs = primitive.get('attributes') or {}
                    if 'COLOR_0' not in attrs:
                        continue
                    colors = gltf['accessors'][attrs['COLOR_0']]
                    if colors.get('componentType') != 5126:
                        continue
                    view = gltf['bufferViews'][colors['bufferView']]
                    start = binary_at + view.get('byteOffset', 0) + colors.get('byteOffset', 0)
                    stride = view.get('byteStride') or 12
                    count = colors['count']
                    for index in range(count):
                        at = start + index * stride
                        restored = _restore_vertex(struct.unpack_from('<3f', data, at))
                        if restored is None:
                            continue
                        struct.pack_into('<3f', data, at, *restored)
            for child in node.get('children', ()):
                repaint(child)

        for root in gltf['scenes'][gltf.get('scene', 0)].get('nodes', ()):
            repaint(root)
        digest = hashlib.sha256(data).hexdigest()
        renamed = f'{layer}-{digest[:16]}.glb'
        temporary = cell / (renamed + '.tmp')
        temporary.write_bytes(data)
        temporary.replace(cell / renamed)
        if renamed != path.name:
            path.unlink(missing_ok=True)
        described['path'] = renamed
        described['sha256'] = digest
        described['bytes'] = len(data)
    manifest['palette'] = SOURCE
    encoded = json.dumps(manifest, indent=2).encode()
    temporary = (cell / 'manifest.json').with_suffix('.json.tmp')
    temporary.write_bytes(encoded)
    temporary.replace(cell / 'manifest.json')
    return True


def recolor(cell, manifest):
    """Write the orthophoto palette into the GLB vertex colours. Once per cell."""
    previous = manifest.get('palette')
    if previous == PALETTE:
        return False
    cell = Path(cell)
    for layer in ('terrain', 'buildings-osm'):
        path = cell / manifest['files'][layer]['path']
        data = bytearray(path.read_bytes())
        if data[:4] != b'glTF':
            continue
        offset = 12
        gltf = None
        binary_at = None
        while offset + 8 <= len(data):
            chunk_length, chunk_kind = struct.unpack_from('<I4s', data, offset)
            if chunk_kind == b'JSON':
                gltf = json.loads(data[offset + 8:offset + 8 + chunk_length])
            elif chunk_kind == b'BIN\x00':
                binary_at = offset + 8
            offset += 8 + chunk_length
        if gltf is None or binary_at is None:
            continue
        binary = data[binary_at:]

        def paint(node_index):
            node = gltf['nodes'][node_index]
            extras = node.get('extras') or {}
            category = extras.get('category') or ''
            water = extras.get('groundLayer') == 11
            terrain = category == 'Terrain'
            roads = category == 'Roads'
            mesh_index = node.get('mesh')
            if mesh_index is not None:
                for primitive in gltf['meshes'][mesh_index]['primitives']:
                    attrs = primitive.get('attributes') or {}
                    if 'POSITION' not in attrs or 'COLOR_0' not in attrs:
                        continue
                    positions = _accessor(gltf, binary, attrs['POSITION'])
                    colors = gltf['accessors'][attrs['COLOR_0']]
                    if colors.get('componentType') != 5126:
                        continue
                    view = gltf['bufferViews'][colors['bufferView']]
                    start = binary_at + view.get('byteOffset', 0) + colors.get('byteOffset', 0)
                    stride = view.get('byteStride') or 12
                    for index, point in enumerate(positions):
                        red, green, blue = _recolor_vertex(struct.unpack_from('<3f', data, start + index * stride), point[1], water, terrain, roads, previous)
                        struct.pack_into('<3f', data, start + index * stride, red, green, blue)
            for child in node.get('children', ()):
                paint(child)

        for root in gltf['scenes'][gltf.get('scene', 0)].get('nodes', ()):
            paint(root)
        temporary = path.with_suffix('.glb.tmp')
        temporary.write_bytes(data)
        temporary.replace(path)
        # The filename stays. The viewer checks this hash, not the name.
        manifest['files'][layer]['sha256'] = hashlib.sha256(data).hexdigest()
        manifest['files'][layer]['bytes'] = len(data)
    manifest['palette'] = PALETTE
    encoded = json.dumps(manifest, indent=2).encode()
    temporary = (cell / 'manifest.json').with_suffix('.json.tmp')
    temporary.write_bytes(encoded)
    temporary.replace(cell / 'manifest.json')
    return True


def restore_published(root):
    """Download washed cells, put the original colours back, and store the new GLB."""
    from world.archive.store import pull, push, replace_manifest
    root = Path(root)
    manifests = sorted((root / 'z').glob('*/*/*/manifest.json'), key=lambda path: (-int(path.parts[-4]), str(path)))
    for manifest_path in manifests:
        cell = manifest_path.parent
        try:
            manifest = json.loads(manifest_path.read_text())
        except (OSError, ValueError):
            continue
        if manifest.get('palette') != PALETTE:
            continue
        names = [manifest['files'][layer]['path'] for layer in ('terrain', 'buildings-osm')]
        if not all((cell / name).is_file() for name in names) and not pull(cell):
            print('Colour restore skipped:', cell.relative_to(root).as_posix(), flush=True)
            continue
        if not restore(cell, manifest):
            continue
        push(cell)
        replace_manifest(cell)
        for name in cell.iterdir():
            if name.suffix == '.glb' or name.name == 'roof.jpg':
                name.unlink()
        print('Colour restored:', cell.relative_to(root).as_posix(), flush=True)


def shoot(cell):
    """Photograph one published directory if both GLBs are present. Returns the JPEG path or None."""
    cell = Path(cell)
    manifest_path = cell / 'manifest.json'
    if not manifest_path.is_file():
        return None
    try:
        manifest = json.loads(manifest_path.read_text())
        tile = manifest['tile']
        z, y = int(tile['z']), int(tile['y'])
        names = [manifest['files'][layer]['path'] for layer in ('terrain', 'buildings-osm')]
    except (OSError, ValueError, KeyError, TypeError):
        return None
    if z not in (13, 14, 15):
        return None
    sources = [cell / name for name in names]
    if not all(path.is_file() for path in sources):
        return None
    newest = max(path.stat().st_mtime for path in sources)
    preview = cell / 'preview.jpg'
    if preview.is_file() and preview.stat().st_mtime >= newest:
        return preview
    if manifest.get('surface') == 'sea':
        image = Image.new('RGB', (SIZE, SIZE), SEA)
        temporary = preview.with_suffix('.jpg.tmp')
        image.save(temporary, 'JPEG', quality=80)
        temporary.replace(preview)
        return preview
    return render(cell, z, y, sources)


def _model_photo(parent, preview):
    """True when preview.jpg is the shot of this cell's own GLB, not a stitch."""
    times = [path.stat().st_mtime for path in parent.glob('*.glb')]
    return bool(times) and preview.stat().st_mtime <= max(times) + 1


def compose(root, z, x, y):
    """Stitch the four child previews into one parent JPEG. None if a child is missing."""
    if z < 12 or z > 14:
        return None
    root = Path(root)
    parent = root / 'z' / str(z) / str(x) / str(y)
    newest = 0.0
    quads = []
    for dy in (0, 1):
        for dx in (0, 1):
            photo = root / 'z' / str(z + 1) / str(x * 2 + dx) / str(y * 2 + dy) / 'preview.jpg'
            if not photo.is_file():
                return None
            newest = max(newest, photo.stat().st_mtime)
            quads.append((dx, dy, photo))
    preview = parent / 'preview.jpg'
    if preview.is_file() and preview.stat().st_mtime >= newest and not _model_photo(parent, preview):
        return preview
    image = Image.new('RGB', (SIZE, SIZE), SEA)
    half = SIZE // 2
    resample = getattr(Image, 'Resampling', Image).BOX
    for dx, dy, photo in quads:
        with Image.open(photo) as child:
            image.paste(child.convert('RGB').resize((half, half), resample), (dx * half, dy * half))
    parent.mkdir(parents=True, exist_ok=True)
    temporary = preview.with_suffix('.jpg.tmp')
    image.save(temporary, 'JPEG', quality=80)
    temporary.replace(preview)
    return preview


def compose_above(cell):
    """z15 photo -> z14, then z13, then z12. Stop at the first parent missing a child."""
    cell = Path(cell)
    if len(cell.parts) < 4 or cell.parts[-4] != 'z':
        return
    try:
        z, x, y = int(cell.parts[-3]), int(cell.parts[-2]), int(cell.parts[-1])
    except ValueError:
        return
    root = cell.parents[3]
    while z > 12:
        z -= 1
        x //= 2
        y //= 2
        if compose(root, z, x, y) is None:
            return


def compose_ready(root):
    """Parents of every z15 that already has a photograph."""
    base = Path(root) / 'z' / '15'
    if not base.is_dir():
        return
    for photo in base.glob('*/*/preview.jpg'):
        compose_above(photo.parent)


def pending(prepare_root):
    """Only missing/stale previews; rendering never changes a published manifest."""
    for manifest in Path(prepare_root).glob('z/*/*/*/manifest.json'):
        photo = manifest.parent / 'preview.jpg'
        if not photo.is_file() or photo.stat().st_mtime < manifest.stat().st_mtime:
            yield manifest.parent
