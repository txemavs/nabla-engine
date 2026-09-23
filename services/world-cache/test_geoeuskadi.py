import copy
import json
from pathlib import Path
import tempfile
import unittest
from import_geoeuskadi import fetch_snapshot, make_artifact, atomic_write, validate_bbox

BBOX = [-1.825, 43.325, -1.81, 43.335]
FEATURE = {'type': 'Feature', 'properties': {'OBJECTID': 1}, 'geometry': {
    'type': 'Polygon', 'coordinates': [[[-1.82, 43.33], [-1.81, 43.33], [-1.81, 43.34], [-1.82, 43.33]]]}}


class ImportTests(unittest.TestCase):
    def query(self, params):
        if params.get('returnIdsOnly'):
            return {'objectIds': [1]}
        return {'type': 'FeatureCollection', 'features': [copy.deepcopy(FEATURE)]}

    def test_complete_snapshot_and_revision(self):
        features = fetch_snapshot(BBOX, self.query, lambda _: None)
        self.assertEqual(features, [FEATURE])
        self.assertEqual(make_artifact(BBOX, features)['revision'], make_artifact(BBOX, features)['revision'])

    def test_reject_partial_duplicate_and_malformed(self):
        bad = [dict(type='FeatureCollection', features=[]),
               dict(type='FeatureCollection', features=[FEATURE, FEATURE]),
               dict(type='FeatureCollection', features=[FEATURE], exceededTransferLimit=True)]
        broken = copy.deepcopy(FEATURE)
        broken['geometry']['coordinates'][0][-1] = [-1.81, 43.34]
        bad.append(dict(type='FeatureCollection', features=[broken]))
        for response in bad:
            with self.subTest(response=response), self.assertRaises(ValueError):
                fetch_snapshot(BBOX, lambda p: self.query(p) if p.get('returnIdsOnly') else response, lambda _: None)

    def test_detect_changed_ids(self):
        calls = 0
        def query(params):
            nonlocal calls
            if params.get('returnIdsOnly'):
                calls += 1
                return {'objectIds': [1] if calls == 1 else [1, 2]}
            return self.query(params)
        with self.assertRaisesRegex(ValueError, 'changed'):
            fetch_snapshot(BBOX, query, lambda _: None)

    def test_batches_all_ids(self):
        batches = []
        def query(params):
            if params.get('returnIdsOnly'):
                return {'objectIds': list(range(205))}
            ids = list(map(int, params['objectIds'].split(',')))
            batches.append(len(ids))
            features = []
            for identifier in ids:
                feature = copy.deepcopy(FEATURE)
                feature['properties']['OBJECTID'] = identifier
                features.append(feature)
            return dict(type='FeatureCollection', features=features)
        self.assertEqual(len(fetch_snapshot(BBOX, query, lambda _: None)), 205)
        self.assertEqual(batches, [100, 100, 5])

    def test_bounds_and_atomic_file(self):
        for bbox in [[0, 0, 1, 1], [2, 2, 1, 1], [float('nan'), 0, 1, 1]]:
            with self.assertRaises(ValueError):
                validate_bbox(bbox)
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / 'snapshot.json'
            atomic_write(path, {'complete': True})
            with self.assertRaises(ValueError):
                atomic_write(path, {'bad': float('nan')})
            self.assertEqual(json.loads(path.read_text()), {'complete': True})
            self.assertEqual(len(list(Path(d).iterdir())), 1)


if __name__ == '__main__':
    unittest.main()
