#!/usr/bin/env python3
"""Tests for bake.py zone generation."""
import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(__file__))
from bake import overpass_features, geo_offset, zone_bounds, bake_zone

class TestOverpassFeatures(unittest.TestCase):
    def test_converts_building_way(self):
        elements = [{
            'type': 'way',
            'id': 12345,
            'tags': {'building': 'yes', 'height': '10'},
            'geometry': [
                {'lat': 43.33, 'lon': -1.82},
                {'lat': 43.33, 'lon': -1.81},
                {'lat': 43.32, 'lon': -1.81},
                {'lat': 43.32, 'lon': -1.82},
                {'lat': 43.33, 'lon': -1.82},
            ]
        }]
        features = overpass_features(elements)
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]['id'], 'way/12345')
        self.assertEqual(features[0]['tags']['building'], 'yes')
        self.assertEqual(features[0]['tags']['height'], '10')
        self.assertEqual(len(features[0]['rings']), 1)
        self.assertEqual(features[0]['rings'][0]['role'], 'outer')
    
    def test_converts_tree_node(self):
        elements = [{
            'type': 'node',
            'id': 67890,
            'tags': {'natural': 'tree'},
            'lat': 43.33,
            'lon': -1.82
        }]
        features = overpass_features(elements)
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]['id'], 'node/67890')
        self.assertEqual(features[0]['rings'][0]['role'], 'point')
        self.assertEqual(features[0]['rings'][0]['coordinates'], [[-1.82, 43.33]])
    
    def test_converts_relation_multipolygon(self):
        elements = [{
            'type': 'relation',
            'id': 99999,
            'tags': {'building': 'yes', 'type': 'multipolygon'},
            'members': [
                {
                    'type': 'way',
                    'ref': 111,
                    'role': 'outer',
                    'geometry': [
                        {'lat': 43.33, 'lon': -1.82},
                        {'lat': 43.33, 'lon': -1.81},
                        {'lat': 43.32, 'lon': -1.81},
                        {'lat': 43.32, 'lon': -1.82},
                        {'lat': 43.33, 'lon': -1.82},
                    ]
                }
            ]
        }]
        features = overpass_features(elements)
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]['id'], 'relation/99999')
    
    def test_skips_unclosed_building_ways(self):
        elements = [{
            'type': 'way',
            'id': 12345,
            'tags': {'building': 'yes'},
            'geometry': [
                {'lat': 43.33, 'lon': -1.82},
                {'lat': 43.33, 'lon': -1.81},
                {'lat': 43.32, 'lon': -1.81},
            ]
        }]
        features = overpass_features(elements)
        self.assertEqual(len(features), 0)
    
    def test_includes_highway_ways(self):
        elements = [{
            'type': 'way',
            'id': 55555,
            'tags': {'highway': 'residential', 'name': 'Test Street'},
            'geometry': [
                {'lat': 43.33, 'lon': -1.82},
                {'lat': 43.33, 'lon': -1.81},
            ]
        }]
        features = overpass_features(elements)
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]['id'], 'way/55555')
        self.assertEqual(features[0]['tags']['highway'], 'residential')

class TestGeoFunctions(unittest.TestCase):
    def test_geo_offset_north(self):
        origin = {'latitude': 43.32969, 'longitude': -1.819606, 'altitude': 28.253}
        lat, lon = geo_offset(origin, 0, -1000)
        self.assertGreater(lat, origin['latitude'])
    
    def test_geo_offset_east(self):
        origin = {'latitude': 43.32969, 'longitude': -1.819606, 'altitude': 28.253}
        lat, lon = geo_offset(origin, 1000, 0)
        self.assertGreater(lon, origin['longitude'])
    
    def test_zone_bounds_center(self):
        origin = {'latitude': 43.32969, 'longitude': -1.819606, 'altitude': 28.253}
        s, w, n, e = zone_bounds(origin, 0, 0)
        self.assertLess(s, origin['latitude'])
        self.assertGreater(n, origin['latitude'])
        self.assertLess(w, origin['longitude'])
        self.assertGreater(e, origin['longitude'])

class TestBakeZone(unittest.TestCase):
    @patch('bake.fetch_osm')
    def test_bake_zone_format(self, mock_fetch):
        mock_fetch.return_value = [{
            'type': 'way',
            'id': 12345,
            'tags': {'building': 'yes'},
            'geometry': [
                {'lat': 43.33, 'lon': -1.82},
                {'lat': 43.33, 'lon': -1.81},
                {'lat': 43.32, 'lon': -1.81},
                {'lat': 43.32, 'lon': -1.82},
                {'lat': 43.33, 'lon': -1.82},
            ]
        }]
        
        origin = {'latitude': 43.32969, 'longitude': -1.819606, 'altitude': 28.253}
        extract = bake_zone(origin, 0, 0, 'Test Zone')
        
        self.assertEqual(extract['name'], 'Test Zone')
        self.assertEqual(extract['origin']['latitude'], origin['latitude'])
        self.assertEqual(extract['terrain']['columns'], 121)
        self.assertEqual(extract['terrain']['rows'], 121)
        self.assertEqual(extract['terrain']['spacing'], 10)
        self.assertEqual(len(extract['terrain']['heights']), 121 * 121)
        self.assertEqual(len(extract['features']), 1)
        self.assertTrue(extract['source']['baked'])

if __name__ == '__main__':
    unittest.main()
