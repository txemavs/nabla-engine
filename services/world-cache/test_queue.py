import tempfile
import unittest
from pathlib import Path
from queue_store import Queue, normalize

ORIGIN = dict(latitude=43.32969, longitude=-1.819606, altitude=28.253)
class QueueTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/'queue.sqlite'
        self.queue=Queue(self.path,capacity=2,output=self.tmp.name)
    def tearDown(self): self.tmp.cleanup()
    def test_deduplicates_and_limits_queue(self):
        self.assertEqual(self.queue.enqueue(ORIGIN,['0_0','1_0','1_1']),2)
        self.assertEqual(self.queue.enqueue(ORIGIN,['0_0']),1)
        self.assertEqual(self.queue.stats(),{'queued':2})
    def test_restart_recovers_running_work(self):
        self.queue.enqueue(ORIGIN,['0_0'])
        job=self.queue.claim()
        self.assertEqual(self.queue.stats(),{'running':1})
        restarted=Queue(self.path)
        self.assertEqual(restarted.claim()['id'],job['id'])
    def test_retry_backoff_and_evicted_output(self):
        self.queue.enqueue(ORIGIN,['0_0'])
        job=self.queue.claim()
        self.queue.finish(job['id'],False)
        self.assertIsNone(self.queue.claim())
        self.queue.finish(job['id'],True)
        self.queue.enqueue(ORIGIN,['0_0'])
        self.assertEqual(self.queue.stats(),{'queued':1})
    def test_normalization_and_validation(self):
        self.assertEqual(normalize(ORIGIN,'0_0')[1],'4/43.329690/-1.819606/28.253/0_0.json')
        for keys in [['../secret'],['99999_0'],['0_0']*25]:
            with self.assertRaises(ValueError):self.queue.enqueue(ORIGIN,keys)
        with self.assertRaises(ValueError):self.queue.enqueue({**ORIGIN,'altitude':float('nan')},['0_0'])
        self.assertEqual(self.queue.stats(),{})
