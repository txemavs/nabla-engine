import json
import tempfile
import unittest
from pathlib import Path
from queue_store import Queue, normalize

class QueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/'queue.sqlite'
        self.queue=Queue(self.path,capacity=2,output=self.tmp.name)
    def tearDown(self): self.tmp.cleanup()
    def test_deduplicates_and_limits_queue(self):
        self.assertEqual(self.queue.enqueue(['z/15/1/1','z/15/2/1','z/15/3/1']),2)
        self.assertEqual(self.queue.enqueue(['z/15/1/1']),1)
        self.assertEqual(self.queue.stats(),{'queued':2})
    def test_restart_recovers_running_work(self):
        self.queue.enqueue(['z/15/1/1'])
        job=self.queue.claim()
        self.assertEqual(self.queue.stats(),{'running':1})
        self.assertEqual(Queue(self.path).claim()['id'],job['id'])
    def test_retry_backoff_and_evicted_output(self):
        self.queue.enqueue(['z/15/1/1'])
        job=self.queue.claim()
        self.queue.finish(job['id'],False)
        self.assertIsNone(self.queue.claim())
        self.queue.finish(job['id'],True)
        self.queue.enqueue(['z/15/1/1'])
        self.assertEqual(self.queue.stats(),{'queued':1})
    def test_old_local_addresses_are_rejected(self):
        self.assertEqual(normalize('z/15/16218/11997')[1],'z/15/16218/11997/manifest.json')
        for keys in [['../secret'],['0_0'],['z/15/32768/0'],['z/15/1/1']*25]:
            with self.assertRaises(ValueError):self.queue.enqueue(keys)
    def test_legacy_jobs_are_not_replayed(self):
        with self.queue.connect() as db:
            db.execute('CREATE TABLE jobs (id TEXT, path TEXT, state TEXT)')
            db.execute("INSERT INTO jobs VALUES ('old','5/old/0_0.json','running')")
        self.assertIsNone(Queue(self.path).claim())

    def test_adopts_native_cells_published_before_the_queue(self):
        directory=Path(self.tmp.name)/'z/15/1/1'
        directory.mkdir(parents=True)
        files={}
        for name in ('terrain','buildings-osm'):
            filename=name+'-'+'a'*16+'.glb'
            (directory/filename).write_bytes(b'glb')
            files[name]={'path':filename,'bytes':3}
        (directory/'manifest.json').write_text(json.dumps({'format':'nabla-planet-tile-v1','generator':'native-xyz-v2','id':'WebMercatorQuad/15/1/1','geometryRevision':'native-surfaces-v2','files':files}))
        self.assertEqual(self.queue.enqueue(['z/15/1/1']),1)
        self.assertEqual(self.queue.stats(),{'ready':1})
        self.assertIsNone(self.queue.claim())

    def test_requeues_old_geometry_while_leaving_its_manifest_available(self):
        self.test_adopts_native_cells_published_before_the_queue()
        path=Path(self.tmp.name)/'z/15/1/1/manifest.json'
        manifest=json.loads(path.read_text());manifest.pop('geometryRevision');path.write_text(json.dumps(manifest))
        self.queue.enqueue(['z/15/1/1'])
        self.assertEqual(self.queue.stats(),{'queued':1})
        from queue_store import ready_manifest
        self.assertIsNotNone(ready_manifest(self.tmp.name,'z/15/1/1'))
