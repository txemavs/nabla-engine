import json
import struct
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

from world.photo.shot import compose_above, shoot


def glb(positions, colour):
    """One triangle, identity node, flat colour."""
    binary = b''.join(struct.pack('<3f', *p) for p in positions)
    binary += struct.pack('<3H', 0, 1, 2)
    binary += b'\x00\x00'
    document = {
        'asset': {'version': '2.0'},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'mesh': 0}],
        'meshes': [{'primitives': [{'attributes': {'POSITION': 0}, 'indices': 1, 'material': 0}]}],
        'materials': [{'pbrMetallicRoughness': {'baseColorFactor': list(colour) + [1]}}],
        'accessors': [
            {'bufferView': 0, 'componentType': 5126, 'count': 3, 'type': 'VEC3'},
            {'bufferView': 1, 'componentType': 5123, 'count': 3, 'type': 'SCALAR'},
        ],
        'bufferViews': [
            {'buffer': 0, 'byteOffset': 0, 'byteLength': 36},
            {'buffer': 0, 'byteOffset': 36, 'byteLength': 6},
        ],
        'buffers': [{'byteLength': len(binary)}],
    }
    payload = json.dumps(document, separators=(',', ':')).encode()
    payload += b' ' * ((4 - len(payload) % 4) % 4)
    binary += b'\x00' * ((4 - len(binary) % 4) % 4)
    chunks = struct.pack('<I4s', len(payload), b'JSON') + payload
    chunks += struct.pack('<I4s', len(binary), b'BIN\x00') + binary
    return struct.pack('<4sII', b'glTF', 2, 12 + len(chunks)) + chunks


class PhotoTests(unittest.TestCase):
    def test_writes_a_top_down_jpeg(self):
        with TemporaryDirectory() as tmp:
            cell = Path(tmp)
            # A triangle covering the centre of a z13 cell. Span is tens of kilometres.
            (cell / 'terrain-0123456789abcdef.glb').write_bytes(glb(
                [(-4000, 0, -4000), (4000, 0, -4000), (0, 0, 4000)],
                (0.8, 0.1, 0.1),
            ))
            (cell / 'buildings-osm-0123456789abcdef.glb').write_bytes(glb(
                [(-200, 30, -200), (200, 30, -200), (0, 30, 200)],
                (0.1, 0.2, 0.9),
            ))
            (cell / 'manifest.json').write_text(json.dumps({
                'tile': {'z': 13, 'x': 4012, 'y': 3012},
                'files': {
                    'terrain': {'path': 'terrain-0123456789abcdef.glb'},
                    'buildings-osm': {'path': 'buildings-osm-0123456789abcdef.glb'},
                },
            }))
            original = {p.name: p.read_bytes() for p in cell.iterdir()}
            path = shoot(cell)
            self.assertEqual({name: (cell / name).read_bytes() for name in original}, original)
            self.assertEqual(path, cell / 'preview.jpg')
            image = Image.open(path)
            self.assertEqual(image.size, (256, 256))
            self.assertEqual(image.format, 'JPEG')
            centre = image.getpixel((128, 128))
            self.assertGreater(centre[2], centre[0])
            self.assertEqual(shoot(cell), path)

    def test_upward_face_uses_the_status_light(self):
        with TemporaryDirectory() as tmp:
            cell = Path(tmp)
            (cell / 'terrain-0123456789abcdef.glb').write_bytes(glb(
                [(-4000, 0, -4000), (4000, 0, -4000), (0, 0, 4000)],
                (0.05, 0.13, 0.02),
            ))
            (cell / 'buildings-osm-0123456789abcdef.glb').write_bytes(glb(
                [(0, 0, 0), (1, 0, 0), (0, 0, 1)],
                (0, 0, 0),
            ))
            (cell / 'manifest.json').write_text(json.dumps({
                'tile': {'z': 13, 'x': 4012, 'y': 3012},
                'files': {
                    'terrain': {'path': 'terrain-0123456789abcdef.glb'},
                    'buildings-osm': {'path': 'buildings-osm-0123456789abcdef.glb'},
                },
            }))
            image = Image.open(shoot(cell))
            green = image.getpixel((128, 128))[1]
            # Linear 0.13 stored as a byte is 33. The lit sRGB value sits near 90.
            self.assertGreater(green, 70)
            self.assertLess(green, 120)

    def test_sea_cell_is_a_blue_jpeg(self):
        with TemporaryDirectory() as tmp:
            cell = Path(tmp)
            (cell / 'terrain-0123456789abcdef.glb').write_bytes(b'glb')
            (cell / 'buildings-osm-0123456789abcdef.glb').write_bytes(b'glb')
            (cell / 'manifest.json').write_text(json.dumps({
                'tile': {'z': 13, 'x': 4096, 'y': 4093},
                'surface': 'sea',
                'files': {
                    'terrain': {'path': 'terrain-0123456789abcdef.glb'},
                    'buildings-osm': {'path': 'buildings-osm-0123456789abcdef.glb'},
                },
            }))
            image = Image.open(shoot(cell))
            red, green, blue = image.getpixel((10, 10))
            self.assertGreater(blue, red)
            self.assertGreater(blue, green)

    def test_four_children_compose_the_parents(self):
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            colours = (
                ((0, 0), (200, 0, 0)),
                ((1, 0), (0, 180, 0)),
                ((0, 1), (0, 0, 160)),
                ((1, 1), (40, 40, 40)),
            )
            for (dx, dy), colour in colours:
                cell = root / 'z' / '15' / str(4 + dx) / str(6 + dy)
                cell.mkdir(parents=True)
                Image.new('RGB', (256, 256), colour).save(cell / 'preview.jpg', 'JPEG')
            compose_above(root / 'z' / '15' / '4' / '6')
            parent = Image.open(root / 'z' / '14' / '2' / '3' / 'preview.jpg')
            self.assertEqual(parent.size, (256, 256))
            self.assertGreater(parent.getpixel((32, 32))[0], 150)
            self.assertGreater(parent.getpixel((160, 32))[1], 120)
            self.assertGreater(parent.getpixel((32, 160))[2], 100)
            self.assertFalse((root / 'z' / '13' / '1' / '1' / 'preview.jpg').is_file())
