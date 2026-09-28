import json
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
import server
from world.queue.store import ready_manifest

class UnifiedDeliveryTests(unittest.TestCase):
    def test_atlas_and_engine_read_the_same_published_photo_and_glb(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(server, 'PREPARE_ROOT', Path(tmp)):
            root = Path(tmp)
            photo = root / 'photos/z/13/1/2.jpg'
            photo.parent.mkdir(parents=True)
            photo.write_bytes(b'canonical-jpeg')
            old = root / 'z/13/1/2/preview.jpg'
            old.parent.mkdir(parents=True)
            old.write_bytes(b'old-preview')
            glb = old.parent / 'terrain-aaaaaaaaaaaaaaaa.glb'
            glb.write_bytes(b'published-glb')
            http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            try:
                base = f'http://127.0.0.1:{http.server_port}'
                for path in ('/tiles/13/1/2.jpg', '/photos/z/13/1/2.jpg'):
                    with urllib.request.urlopen(base + path) as response:
                        self.assertEqual(response.read(), b'canonical-jpeg')
                with urllib.request.urlopen(base + '/z/13/1/2/' + glb.name) as response:
                    self.assertEqual(response.read(), b'published-glb')
                photo.unlink()
                with urllib.request.urlopen(base + '/photos/z/13/1/2.jpg') as response:
                    self.assertEqual(response.read(), b'old-preview')
            finally:
                http.shutdown(); http.server_close(); thread.join()

    def test_missing_glb_is_not_announced_as_ready_without_archive(self):
        with tempfile.TemporaryDirectory() as tmp, patch('world.archive.store.archived', return_value=False):
            cell = Path(tmp) / 'z/15/1/1'
            cell.mkdir(parents=True)
            manifest = {'format': 'nabla-planet-tile-v1', 'generator': 'native-xyz-v2',
                        'id': 'WebMercatorQuad/15/1/1', 'files': {}}
            for name in ('terrain', 'buildings-osm'):
                filename = name + '-' + 'a' * 16 + '.glb'
                (cell / filename).write_bytes(b'glb')
                manifest['files'][name] = {'path': filename, 'bytes': 3}
            (cell / 'manifest.json').write_text(json.dumps(manifest))
            self.assertIsNotNone(ready_manifest(tmp, 'z/15/1/1'))
            (cell / manifest['files']['terrain']['path']).unlink()
            self.assertIsNone(ready_manifest(tmp, 'z/15/1/1'))
