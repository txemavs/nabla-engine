"""Private, disk-backed OSM/Esri cache. Bind behind an authenticated/private transport."""
import hashlib, hmac, json, os, re, threading, time, urllib.request, urllib.error
from http.cookies import SimpleCookie
from queue_store import Queue, ready_manifest
from pathlib import Path
from baked_format import valid_bake
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
ROOT = Path(os.environ.get('CACHE_DIR', '/data'))
ROOT.mkdir(parents=True, exist_ok=True)
BAKED = ROOT / 'baked'
TTL = int(os.environ.get('CACHE_TTL_SECONDS', '2592000'))
LIMIT = int(os.environ.get('CACHE_MAX_BYTES', '10737418240'))
OSM = 'https://overpass-api.de/api/interpreter'
ESRI = 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/'
locks = [threading.Lock() for _ in range(64)]
osm_lock = threading.Lock()
next_osm = 0.0
PREPARE_TOKEN = os.environ.get('PREPARE_TOKEN', '')
PUBLIC_NEIGHBOR_LIMIT = max(0, int(os.environ.get('PREPARE_PUBLIC_NEIGHBORS_PER_HOUR', '0')))
PREPARE_ROOT = Path(os.environ.get('PREPARE_ROOT', str(ROOT / 'prepared')))
PREPARE_QUEUE = Queue(ROOT / 'prepare.sqlite', output=PREPARE_ROOT) if PREPARE_TOKEN else None


def get_baked(lat, lon, key):
    """Check for pre-baked zone file. Returns (data, True) or (None, False)."""
    path = BAKED / f"{lat:.5f}" / f"{lon:.5f}" / f"{key}.json"
    if path.exists():
        try:
            data = path.read_bytes()
            if valid_bake(json.loads(data), lat, lon, key):
                return data, True
        except (OSError, ValueError):
            pass
    return None, False

def cached(key, url, body=None):
    global next_osm
    digest = hashlib.sha256(key.encode()).hexdigest()
    path = ROOT / (digest + '.bin')
    with locks[int(digest[:4], 16) % len(locks)]:
        if path.exists() and time.time() - path.stat().st_mtime < TTL:
            return path.read_bytes(), 'HIT'
        try:
            if body is not None:
                with osm_lock:
                    delay = max(0, next_osm - time.monotonic())
                    if delay: time.sleep(delay)
                    next_osm = time.monotonic() + 30
                    try:
                        data = download(url, body)
                    except Exception:
                        next_osm = time.monotonic() + 60
                        raise
            else:
                data = download(url, body)
            if body is not None:
                result = json.loads(data)
                if 'remark' in result or not isinstance(result.get('elements'), list):
                    raise ValueError('Incomplete OSM response')
            if body is None and not data.startswith((b'CntZImage ', b'Lerc2 ')):
                raise ValueError('Invalid elevation response')
            tmp = path.with_suffix('.tmp')
            tmp.write_bytes(data)
            tmp.replace(path)
            return data, 'MISS'
        except Exception:
            if path.exists():
                return path.read_bytes(), 'STALE'
            raise

def download(url, body):
    request = urllib.request.Request(url, data=body, headers={
        'User-Agent': 'NablaWorldCache/1.0 (https://github.com/txemavs/nabla-engine)',
        'Content-Type': 'application/x-www-form-urlencoded',
    })
    with urllib.request.urlopen(request, timeout=40) as response:
        data = response.read(16_000_001)
        if len(data) > 16_000_000:
            raise ValueError('Upstream response too large')
        return data

def prune():
    while True:
        files = sorted(ROOT.glob('*.bin'), key=lambda p: p.stat().st_mtime)
        total = sum(p.stat().st_size for p in files)
        for path in files:
            if total <= LIMIT: break
            try:
                total -= path.stat().st_size
                path.unlink()
            except FileNotFoundError: pass
        time.sleep(60)

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args): pass  # No location/query logging.
    def respond(self, code, data, mime='application/json', state=None, etag=None):
        self.send_response(code)
        self.send_header('Content-Type', mime)
        if code != 304: self.send_header('Content-Length', str(len(data)))
        if etag: self.send_header('ETag', etag)
        self.send_header('Cache-Control', 'private, max-age=0')
        if state: self.send_header('X-Nabla-Cache', state)
        if code == 429: self.send_header('Retry-After', '60')
        self.end_headers()
        self.wfile.write(data)
    def authorized(self):
        if not PREPARE_TOKEN:
            return False
        try:
            cookie = SimpleCookie(self.headers.get('Cookie', ''))
            value = cookie['nabla_prepare'].value
            expires, signature = value.split('.')
            expected = hmac.new(PREPARE_TOKEN.encode(), expires.encode(), hashlib.sha256).hexdigest()
            return int(expires) > time.time() and hmac.compare_digest(signature, expected)
        except (KeyError, ValueError):
            return False

    def do_GET(self):
        if self.path == '/prepare/status':
            if not self.authorized():
                self.respond(401, b'{"error":"Preparation access required"}')
            else:
                self.respond(200, json.dumps(PREPARE_QUEUE.stats()).encode())
            return

        if self.path == '/health':
            self.respond(200, b'{"ok":true}')
            return
        # Baked zone endpoint: GET /baked/<lat>/<lon>/<key>
        baked_match = re.fullmatch(r'/baked/(-?\d+\.\d+)/(-?\d+\.\d+)/(-?\d+_-?\d+)', self.path)
        if baked_match:
            lat, lon, key = baked_match.groups()
            data, found = get_baked(float(lat), float(lon), key)
            if found:
                etag = '"' + hashlib.sha256(data).hexdigest() + '"'
                if self.headers.get('If-None-Match') == etag:
                    self.respond(304, b'', state='BAKED', etag=etag)
                else:
                    self.respond(200, data, 'application/json', 'BAKED', etag)
            else:
                self.respond(404, b'{"error":"Zone not baked"}')
            return
        match = re.fullmatch(r'/elevation/(10|12)/(\d{1,4})/(\d{1,4})', self.path)
        if not match or any(int(n) >= 2 ** int(match.group(1)) for n in match.groups()[1:]):
            self.respond(404, b'{"error":"Unknown tile"}'); return
        self.fetch('elevation:' + self.path, ESRI + self.path.removeprefix('/elevation/'), None, 'application/octet-stream')
    def do_POST(self):
        if self.path == '/prepare/session':
            supplied = self.headers.get('Authorization', '').removeprefix('Bearer ')
            if not PREPARE_TOKEN or not hmac.compare_digest(supplied, PREPARE_TOKEN):
                self.respond(401, b'{"error":"Invalid preparation access"}')
                return
            expires = str(int(time.time()) + 30 * 86400)
            signature = hmac.new(PREPARE_TOKEN.encode(), expires.encode(), hashlib.sha256).hexdigest()
            self.send_response(204)
            self.send_header('Set-Cookie', f'nabla_prepare={expires}.{signature}; Path=/prepare; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            return
        if self.path == '/prepare/zones':
            self.respond(410, b'{"error":"Use canonical XYZ /prepare/tiles"}')
            return
        if self.path == '/prepare/tiles':
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 8192:
                    raise ValueError('Invalid request size')
                data = json.loads(self.rfile.read(length))
                keys = data['keys']
                if not isinstance(keys, list) or not 1 <= len(keys) <= 24:
                    raise ValueError('Expected 1-24 canonical tiles')
                from queue_store import normalize
                tiles = [normalize(key) for key in keys]
                authorized = self.authorized()
                access = 'owner' if authorized else 'neighbors' if PUBLIC_NEIGHBOR_LIMIT and PREPARE_QUEUE else 'read-only'
                accepted = (PREPARE_QUEUE.enqueue(keys, public_limit=None if authorized else PUBLIC_NEIGHBOR_LIMIT)
                            if PREPARE_QUEUE and access != 'read-only' else 0)
                available = {}
                for _, _, key in tiles:
                    manifest = ready_manifest(PREPARE_ROOT, key)
                    if manifest:
                        available[key] = manifest
                self.respond(200, json.dumps({'available':available, 'accepted':accepted, 'authorized':authorized, 'generationAccess':access}).encode())
            except (ValueError, KeyError, TypeError):
                self.respond(400, b'{"error":"Invalid planetary tile request"}')
            return

        if self.path != '/osm': self.respond(404, b'{}'); return
        try: size = int(self.headers.get('Content-Length', '0'))
        except ValueError: size = 0
        if not 0 < size <= 131072: self.respond(413, b'{"error":"Invalid request size"}'); return
        body = self.rfile.read(size)
        self.fetch('osm:' + body.decode('utf-8'), OSM, body, 'application/json')
    def fetch(self, key, url, body, mime):
        try:
            data, state = cached(key, url, body)
            self.respond(200, data, mime, state)
        except urllib.error.HTTPError as e:
            self.respond(429 if e.code in (406,429) else 502, json.dumps({'error':'Provider unavailable; retry later','upstreamStatus':e.code}).encode())
        except Exception:
            self.respond(502, b'{"error":"Provider unavailable; retry later"}')

if __name__ == '__main__':
    threading.Thread(target=prune, daemon=True).start()
    if PREPARE_QUEUE:
        from prepare_worker import run
        threading.Thread(target=run, args=(PREPARE_QUEUE, ROOT, PREPARE_ROOT, int(os.environ.get('PREPARE_MAX_BYTES', '5368709120'))), daemon=True).start()
    ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
