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

if __name__ == '__main__':
    unittest.main()
