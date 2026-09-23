import unittest
from unittest.mock import Mock
import server

class ElevationLevelsTest(unittest.TestCase):
    def test_accepts_coarse_level_and_rejects_out_of_range_tiles(self):
        handler = Mock()
        handler.path = '/elevation/10/1023/1023'
        server.Handler.do_GET(handler)
        handler.fetch.assert_called_once()
        handler.reset_mock()
        handler.path = '/elevation/10/1024/0'
        server.Handler.do_GET(handler)
        handler.respond.assert_called_once_with(404, b'{"error":"Unknown tile"}')
        handler.fetch.assert_not_called()
