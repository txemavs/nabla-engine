import importlib.util, tempfile, unittest, urllib.error
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('cache_server',Path(__file__).with_name('server.py'))
cache=importlib.util.module_from_spec(spec);spec.loader.exec_module(cache)
class CacheTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();cache.ROOT=Path(self.tmp.name);cache.next_osm=0
    def tearDown(self):self.tmp.cleanup()
    def test_hit_survives_process_state_reset(self):
        with patch.object(cache,'download',return_value=b'{"elements":[]}') as fetch:
            self.assertEqual(cache.cached('same','https://unused',b'data=query')[1],'MISS')
            cache.next_osm=0
            self.assertEqual(cache.cached('same','https://unused',b'data=query')[1],'HIT')
            self.assertEqual(fetch.call_count,1)
    def test_incomplete_osm_is_not_cached(self):
        with patch.object(cache,'download',return_value=b'{"elements":[],"remark":"timeout"}'):
            with self.assertRaises(ValueError):cache.cached('bad','https://unused',b'data=query')
        self.assertEqual(list(cache.ROOT.glob('*.bin')),[])
    def test_stale_data_survives_upstream_failure(self):
        with patch.object(cache,'download',return_value=b'CntZImage terrain'):cache.cached('elevation','https://unused')
        with patch.object(cache,'TTL',-1),patch.object(cache,'download',side_effect=OSError('offline')):
            self.assertEqual(cache.cached('elevation','https://unused'),(b'CntZImage terrain','STALE'))
    def test_provider_json_error_is_not_cached_as_elevation(self):
        with patch.object(cache,'download',return_value=b'{"error":"unavailable"}'):
            with self.assertRaises(ValueError):cache.cached('invalid-elevation','https://unused')
        self.assertEqual(list(cache.ROOT.glob('*.bin')),[])
    def test_cooldown_does_not_block_existing_cache(self):
        with patch.object(cache,'download',return_value=b'{"elements":[]}'),patch.object(cache.time,'sleep') as wait:
            cache.cached('first','https://unused',b'data=one')
            cache.cached('second','https://unused',b'data=two')
            self.assertEqual(wait.call_count,1)
            self.assertEqual(cache.cached('first','https://unused',b'data=one')[1],'HIT')
if __name__=='__main__':unittest.main()
