import io
import unittest
from urllib.error import HTTPError
from prepare_worker import failure_detail

class WorkerDiagnosticsTests(unittest.TestCase):
    def test_reports_cache_and_provider_status_without_url_or_body(self):
        error = HTTPError('http://private/osm', 502, 'Bad gateway', {},
                          io.BytesIO(b'{"upstreamStatus":504,"secret":"do not log"}'))
        self.assertEqual(failure_detail(error), 'OSM cache HTTP 502 (provider HTTP 504)')

    def test_handles_non_json_and_other_errors(self):
        error = HTTPError('http://private/osm', 429, 'Busy', {}, io.BytesIO(b'not json'))
        self.assertEqual(failure_detail(error), 'OSM cache HTTP 429')
        self.assertEqual(failure_detail(ValueError('private detail')), 'ValueError')
