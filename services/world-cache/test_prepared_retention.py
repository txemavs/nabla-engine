import tempfile
import unittest
from pathlib import Path
from prepare_worker import trim_prepared

class RetentionTests(unittest.TestCase):
    def test_native_eviction_keeps_current_and_legacy_authored_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for key in ['z/15/1/1','z/15/1/2']:
                directory=root/key;directory.mkdir(parents=True)
                (directory/'manifest.json').write_text('{}')
                (directory/'terrain.glb').write_bytes(b'x'*100)
            legacy=root/'saved-scene.json';legacy.write_text('keep')
            current=root/'z/15/1/2/manifest.json'
            trim_prepared(root,current,105)
            self.assertTrue(current.exists())
            self.assertFalse((root/'z/15/1/1').exists())
            self.assertEqual(legacy.read_text(),'keep')
