import unittest
from prepare_planet import tile_bounds


class PlanetAddressTests(unittest.TestCase):
    def test_exact_standard_bounds(self):
        tile, (south, west, north, east) = tile_bounds('z/15/16218/11997')
        self.assertEqual(tile, dict(z=15, x=16218, y=11997))
        self.assertAlmostEqual(east - west, 360 / 32768, places=12)
        self.assertGreater(north, south)
        self.assertEqual(east, tile_bounds('z/15/16219/11997')[1][1])
        self.assertEqual(south, tile_bounds('z/15/16218/11998')[1][2])

    def test_rejects_local_tiles_aliases_and_paths(self):
        for address in ['0_0', '5_-6', 'z/15/016218/11997', 'z/15/32768/0',
                        'z/15/-1/0', 'z/12/1/1', 'z/15/1/2/../../../', 'z/15/1/2.json']:
            with self.subTest(address=address), self.assertRaises(ValueError):
                tile_bounds(address)

    def test_parent_covers_four_children(self):
        _, parent = tile_bounds('z/14/8109/5998')
        children = [tile_bounds(f'z/15/{16218+x}/{11996+y}')[1] for x in range(2) for y in range(2)]
        self.assertEqual(parent, (min(b[0] for b in children), min(b[1] for b in children),
                                  max(b[2] for b in children), max(b[3] for b in children)))
