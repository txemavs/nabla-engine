import tempfile
import unittest
from pathlib import Path
from prepare_worker import trim_prepared

class PreparedRetentionTest(unittest.TestCase):
    def test_budget_counts_both_formats_and_keeps_current_pair(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ('old.json', 'old.bin', 'current.json', 'current.bin'):
                (root / name).write_bytes(b'x' * 30)
            trim_prepared(root, root / 'current.json', 70)
            self.assertFalse((root / 'old.json').exists())
            self.assertFalse((root / 'old.bin').exists())
            self.assertEqual(sum(p.stat().st_size for p in root.iterdir()), 60)

    def test_glb_sidecars_count_toward_budget_and_evict_with_tile(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ('old.json', 'old.bin', 'current.json', 'current.bin'):
                (root / name).write_bytes(b'x' * 30)
            for tile in ('old', 'current'):
                layer = root / (tile + '.glb-tile')
                layer.mkdir()
                (layer / 'terrain.glb').write_bytes(b'x' * 100)
                (layer / 'manifest.json').write_bytes(b'x' * 20)
            trim_prepared(root, root / 'current.json', 200)
            self.assertFalse((root / 'old.glb-tile').exists())
            self.assertFalse((root / 'old.bin').exists())
            self.assertTrue((root / 'current.glb-tile' / 'terrain.glb').exists())
            self.assertEqual(sum(p.stat().st_size for p in root.rglob('*') if p.is_file()), 180)


class SidecarRevisionTest(unittest.TestCase):
    def test_missing_old_and_complete_revision(self):
        import json
        from prepare_worker import sidecar_current
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / '0_0.bin'
            target.write_bytes(b'prepared')
            self.assertFalse(sidecar_current(target))
            layer = target.with_suffix('.glb-tile')
            layer.mkdir()
            (layer / 'manifest.json').write_text(json.dumps({'groundRevision': 1}))
            for name in ('terrain.glb', 'buildings-osm.glb'):
                (layer / name).write_bytes(b'glb')
            self.assertFalse(sidecar_current(target))
            (layer / 'manifest.json').write_text(json.dumps({'groundRevision': 2}))
            self.assertTrue(sidecar_current(target))
            (layer / 'terrain.glb').unlink()
            self.assertFalse(sidecar_current(target))

if __name__ == '__main__':
    unittest.main()
