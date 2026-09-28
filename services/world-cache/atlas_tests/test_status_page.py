import json
import tempfile
import unittest
from pathlib import Path

from world.status.page import coverage, service_snapshot
from world.queue.store import Queue


class StatusPageTests(unittest.TestCase):
    def test_reports_requests_coverage_and_disk(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cache = root / 'cache'
            publish = root / 'publish'
            cache.mkdir()
            cell = publish / 'z' / '15' / '16218' / '11999'
            cell.mkdir(parents=True)
            (cell / 'terrain-0123456789abcdef.glb').write_bytes(b'x' * 1000)
            (cell / 'manifest.json').write_text(json.dumps({
                'format': 'nabla-planet-tile-v1',
                'files': {
                    'terrain': {'bytes': 1000, 'path': 'terrain-0123456789abcdef.glb'},
                    'buildings-osm': {'bytes': 1, 'path': 'buildings-osm-0123456789abcdef.glb'},
                },
            }))
            (cache / 'blob.bin').write_bytes(b'y' * 500)
            queue = Queue(cache / 'prepare.sqlite', output=publish)
            queue.enqueue(['z/15/16218/11999'])
            snap = service_snapshot(cache, publish, queue)
            self.assertEqual(snap['queue']['generating'], 1)
            self.assertEqual(snap['requests'][0]['tile'], 'z/15/16218/11999')
            self.assertEqual(snap['coverage']['tiles'], 1)
            self.assertGreater(snap['coverage']['north'], snap['coverage']['south'])
            self.assertGreaterEqual(snap['disk']['publishedBytes'], 1000)
            self.assertGreaterEqual(snap['disk']['cacheBytes'], 500)
            self.assertEqual(snap['disk']['bytes'], snap['disk']['cacheBytes'] + snap['disk']['publishedBytes'])
            self.assertGreater(snap['coverage']['focus']['latitude'], 40)
            self.assertLess(snap['coverage']['focus']['longitude'], 0)

    def test_focus_stays_on_the_dense_cluster(self):
        irun = {'z': 15, 'south': 43.32, 'west': -1.84, 'north': 43.34, 'east': -1.80}
        swapped = {'z': 13, 'south': -3.75, 'west': 40.40, 'north': -3.67, 'east': 40.56}
        cover = coverage([irun] * 8 + [swapped])
        self.assertLess(cover['south'], 0)
        self.assertGreater(cover['east'], 40)
        self.assertGreater(cover['focus']['latitude'], 43)
        self.assertLess(cover['focus']['longitude'], 0)
