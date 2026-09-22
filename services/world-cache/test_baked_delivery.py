"""Exercise the bake publication and HTTP/browser revalidation contract."""
import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import server
from bake import bake_zone, IRUN_VENTAS
from baked_format import atomic_write, valid_bake

class DeliveryTests(unittest.TestCase):
    def extract(self):
        with patch('bake.fetch_osm', return_value=[]):
            return bake_zone(IRUN_VENTAS, 0, 0, 'Test')

    def test_atomic_failure_preserves_previous_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'zone.json'
            atomic_write(path, {'old': True})
            with self.assertRaises(ValueError):
                atomic_write(path, {'bad': float('nan')})
            self.assertEqual(json.loads(path.read_text()), {'old': True})
            self.assertEqual(list(Path(directory).glob('*.tmp')), [])

    def test_schema_rejects_wrong_zone_and_version(self):
        data = self.extract()
        self.assertTrue(valid_bake(data, 43.32969, -1.81961, '0_0'))
        self.assertFalse(valid_bake(data, 43.32969, -1.81961, '1_0'))
        data['source']['bakeVersion'] = 999
        self.assertFalse(valid_bake(data, 43.32969, -1.81961, '0_0'))

    def test_http_etag_changes_after_atomic_rebuild(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, 'BAKED', Path(directory)):
            path = Path(directory) / '43.32969/-1.81961/0_0.json'
            data = self.extract()
            atomic_write(path, data)
            http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            try:
                url = f'http://127.0.0.1:{http.server_port}/baked/43.32969/-1.81961/0_0'
                with urllib.request.urlopen(url) as response:
                    etag = response.headers['ETag']
                    self.assertEqual(response.headers['X-Nabla-Cache'], 'BAKED')
                request = urllib.request.Request(url, headers={'If-None-Match': etag})
                with self.assertRaises(urllib.error.HTTPError) as result:
                    urllib.request.urlopen(request)
                self.assertEqual(result.exception.code, 304)
                data['name'] = 'Updated'
                atomic_write(path, data)
                with urllib.request.urlopen(request) as response:
                    self.assertNotEqual(response.headers['ETag'], etag)
                    self.assertEqual(json.load(response)['name'], 'Updated')
            finally:
                http.shutdown()
                http.server_close()
                thread.join()
