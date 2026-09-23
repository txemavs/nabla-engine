import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from queue_store import Queue, has_ready_neighbor


class PublicNeighborsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.path = self.root / 'queue.sqlite'
        self.queue = Queue(self.path, output=self.root)
        self.seed('z/15/100/100')

    def tearDown(self):
        self.tmp.cleanup()

    def seed(self, key):
        directory = self.root / key
        directory.mkdir(parents=True, exist_ok=True)
        files = {}
        for layer in ('terrain', 'buildings-osm'):
            name = layer + '-' + 'a' * 16 + '.glb'
            (directory / name).write_bytes(b'fixture')
            files[layer] = {'path': name, 'bytes': 7}
        (directory / 'manifest.json').write_text(json.dumps({
            'format': 'nabla-planet-tile-v1', 'generator': 'native-xyz-v2',
            'geometryRevision': 'native-surfaces-v2',
            'id': key.replace('z/', 'WebMercatorQuad/', 1), 'files': files,
        }))

    def test_only_complete_same_zoom_neighbors_seed_expansion(self):
        self.assertEqual(self.queue.enqueue(['z/15/101/100'], public_limit=24), 1)
        self.assertEqual(self.queue.enqueue(['z/15/102/100'], public_limit=24), 0)
        self.assertEqual(self.queue.enqueue(['z/14/50/50'], public_limit=24), 1)
        self.assertEqual(self.queue.enqueue(['z/15/101/101'], public_limit=24), 1)
        (self.root / 'z/15/100/100' / ('terrain-' + 'a'*16 + '.glb')).unlink()
        self.assertFalse(has_ready_neighbor(self.root, 'z/15/99/100'))

    def test_quota_survives_restart_duplicates_and_owner_bypasses_it(self):
        key = 'z/15/101/100'
        self.assertEqual(self.queue.enqueue([key], public_limit=1), 1)
        self.assertEqual(self.queue.enqueue([key], public_limit=1), 1)
        reopened = Queue(self.path, output=self.root)
        self.assertEqual(reopened.enqueue(['z/15/99/100'], public_limit=1), 0)
        self.assertEqual(reopened.enqueue(['z/15/1000/1000']), 1)
        self.assertEqual(reopened.claim()['tile'], 'z/15/1000/1000')

    def test_concurrent_admissions_share_one_allowance(self):
        keys = ['z/15/99/100', 'z/15/101/100', 'z/15/100/99', 'z/15/100/101']
        with ThreadPoolExecutor(max_workers=4) as pool:
            accepted = list(pool.map(lambda key: self.queue.enqueue([key], public_limit=2), keys))
        self.assertEqual(sum(accepted), 2)

    def test_expired_allowance_is_released(self):
        self.queue.enqueue(['z/15/101/100'], public_limit=1)
        with self.queue.connect() as db:
            db.execute('UPDATE public_admissions SET admitted=0')
        self.assertEqual(self.queue.enqueue(['z/15/99/100'], public_limit=1), 1)

    def test_antimeridian_wraps_but_north_south_do_not(self):
        self.seed('z/15/0/0')
        self.assertTrue(has_ready_neighbor(self.root, 'z/15/32767/0'))
        self.assertFalse(has_ready_neighbor(self.root, 'z/15/0/32767'))

    def test_disabled_and_full_queue_do_not_consume_allowance(self):
        self.assertEqual(self.queue.enqueue(['z/15/101/100'], public_limit=0), 0)
        self.queue.capacity = 0
        self.assertEqual(self.queue.enqueue(['z/15/101/100'], public_limit=24), 0)
        with self.queue.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM public_admissions').fetchone()[0], 0)

    def test_ancestor_and_descendant_coverage_allow_other_zooms(self):
        self.assertEqual(self.queue.enqueue(['z/13/25/25'], public_limit=24), 1)
        self.assertEqual(self.queue.enqueue(['z/14/51/50'], public_limit=24), 0)
        self.seed('z/13/200/300')
        self.assertEqual(self.queue.enqueue(['z/15/803/1203'], public_limit=24), 1)
        self.assertEqual(self.queue.enqueue(['z/15/804/1203'], public_limit=24), 0)
