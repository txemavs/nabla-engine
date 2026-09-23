import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import server
from queue_store import Queue

class AccessTests(unittest.TestCase):
    def test_only_private_session_can_enqueue(self):
        with tempfile.TemporaryDirectory() as tmp:
            queue=Queue(Path(tmp)/'jobs.sqlite')
            with patch.object(server,'PREPARE_TOKEN','test-owner-secret'),patch.object(server,'PREPARE_QUEUE',queue):
                http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
                worker=threading.Thread(target=http.serve_forever,daemon=True);worker.start()
                base=f'http://127.0.0.1:{http.server_port}/prepare'
                body=json.dumps({'keys':['z/15/16218/11997']}).encode()
                try:
                    with urllib.request.urlopen(urllib.request.Request(base+'/tiles',data=body)) as response:
                        self.assertEqual(json.load(response)['accepted'],0)
                    self.assertEqual(queue.stats(),{})
                    with urllib.request.urlopen(urllib.request.Request(base+'/session',data=b'',headers={'Authorization':'Bearer test-owner-secret'})) as response:
                        cookie=response.headers['Set-Cookie']
                        self.assertIn('HttpOnly',cookie)
                        self.assertIn('Secure',cookie)
                        self.assertIn('SameSite=Strict',cookie)
                    headers={'Cookie':cookie.split(';')[0]}
                    with urllib.request.urlopen(urllib.request.Request(base+'/tiles',data=body,headers=headers)) as response:
                        self.assertEqual(response.status,200)
                        self.assertEqual(json.load(response)['accepted'],1)
                    with urllib.request.urlopen(urllib.request.Request(base+'/status',headers=headers)) as response:
                        self.assertEqual(json.load(response),{'queued':1})
                finally:
                    http.shutdown();http.server_close();worker.join()

    def test_public_mode_reports_neighbor_access_without_owner_authorization(self):
        with tempfile.TemporaryDirectory() as tmp:
            queue = Queue(Path(tmp)/'jobs.sqlite', output=tmp)
            with patch.object(server, 'PREPARE_TOKEN', 'owner'), \
                 patch.object(server, 'PREPARE_QUEUE', queue), \
                 patch.object(server, 'PUBLIC_NEIGHBOR_LIMIT', 2), \
                 patch('queue_store.has_ready_neighbor', return_value=True):
                http = ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
                worker = threading.Thread(target=http.serve_forever, daemon=True)
                worker.start()
                try:
                    request = urllib.request.Request(
                        f'http://127.0.0.1:{http.server_port}/prepare/tiles',
                        data=json.dumps({'keys': ['z/15/101/100']}).encode())
                    with urllib.request.urlopen(request) as response:
                        result = json.load(response)
                    self.assertFalse(result['authorized'])
                    self.assertEqual(result['generationAccess'], 'neighbors')
                    self.assertEqual(result['accepted'], 1)
                finally:
                    http.shutdown(); http.server_close(); worker.join()
