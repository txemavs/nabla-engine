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
                body=json.dumps({'origin':{'latitude':43.32969,'longitude':-1.819606,'altitude':28.253},'keys':['0_0']}).encode()
                try:
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        urllib.request.urlopen(urllib.request.Request(base+'/zones',data=body))
                    self.assertEqual(error.exception.code,401)
                    self.assertEqual(queue.stats(),{})
                    with urllib.request.urlopen(urllib.request.Request(base+'/session',data=b'',headers={'Authorization':'Bearer test-owner-secret'})) as response:
                        cookie=response.headers['Set-Cookie']
                        self.assertIn('HttpOnly',cookie)
                        self.assertIn('Secure',cookie)
                        self.assertIn('SameSite=Strict',cookie)
                    headers={'Cookie':cookie.split(';')[0]}
                    with urllib.request.urlopen(urllib.request.Request(base+'/zones',data=body,headers=headers)) as response:
                        self.assertEqual(response.status,202)
                        self.assertEqual(json.load(response)['accepted'],1)
                    with urllib.request.urlopen(urllib.request.Request(base+'/status',headers=headers)) as response:
                        self.assertEqual(json.load(response),{'queued':1})
                finally:
                    http.shutdown();http.server_close();worker.join()
