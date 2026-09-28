import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from world.archive import store


class ArchiveTests(unittest.TestCase):
    def test_stays_off_without_a_bucket(self):
        with patch.dict(os.environ, {'ATLAS_BUCKET': '', 'AWS_ACCESS_KEY_ID': '', 'AWS_SECRET_ACCESS_KEY': ''}, clear=False):
            self.assertFalse(store.enabled())
            self.assertFalse(store.pull(Path('/tmp/z/15/1/2')))
            self.assertEqual(store.push(Path('/tmp/z/15/1/2')), 0)

    def test_pulls_a_missing_cell_and_does_not_replace_an_existing_upload(self):
        env = {
            'ATLAS_BUCKET': 'atlas-example',
            'AWS_ACCESS_KEY_ID': 'key',
            'AWS_SECRET_ACCESS_KEY': 'secret',
            'ATLAS_REGION': 'eu-west-1',
        }
        with TemporaryDirectory() as tmp, patch.dict(os.environ, env):
            cell = Path(tmp) / 'z' / '15' / '1' / '2'
            calls = []

            def fake_call(method, key, query='', body=None, headers=None):
                calls.append((method, key, query, headers))
                if method == 'GET' and query.startswith('list-type=2'):
                    xml = b'<ListBucketResult><Contents><Key>z/15/1/2/manifest.json</Key></Contents><Contents><Key>z/15/1/2/preview.jpg</Key></Contents></ListBucketResult>'
                    return 200, xml
                if method == 'GET':
                    return 200, b'{"format":"nabla-planet-tile-v1"}' if key.endswith('manifest.json') else b'jpeg'
                if method == 'PUT':
                    return 412, b'exists'
                return 500, b''

            with patch.object(store, '_call', fake_call):
                self.assertTrue(store.pull(cell))
                (cell / 'terrain.glb').write_bytes(b'glb')
                self.assertEqual(store.push(cell), 0)
                self.assertTrue(store.complete(cell))
            self.assertEqual((cell / 'manifest.json').read_bytes()[:1], b'{')
            self.assertEqual((cell / 'preview.jpg').read_bytes(), b'jpeg')
            self.assertIn(
                ('PUT', 'z/15/1/2/terrain.glb', '', {'if-none-match': '*', 'content-type': 'model/gltf-binary'}),
                [(c[0], c[1], c[2], c[3]) for c in calls if c[0] == 'PUT'] or calls,
            )
            puts = [c for c in calls if c[0] == 'PUT']
            self.assertTrue(all(c[3].get('if-none-match') == '*' for c in puts))
