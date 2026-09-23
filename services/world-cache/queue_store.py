"""Bounded durable queue addressed only by canonical planetary XYZ cells."""
import hashlib
import json
import sqlite3
import time
from pathlib import Path
from prepare_planet import tile_bounds


def normalize(key):
    tile_bounds(key)
    path = key + '/manifest.json'
    return hashlib.sha256(path.encode()).hexdigest(), path, key


def ready_manifest(output, key):
    _, path, _ = normalize(key)
    try:
        manifest = json.loads((Path(output) / path).read_text())
        if (manifest.get('format') != 'nabla-planet-tile-v1' or
                manifest.get('generator') != 'native-xyz-v2' or
                manifest.get('id') != key.replace('z/', 'WebMercatorQuad/', 1)):
            return None
        import re
        for name in ('terrain', 'buildings-osm'):
            file = manifest['files'][name]
            if not re.fullmatch(name + r'-[a-f0-9]{16}\.glb', file['path']):
                return None
            if (Path(output) / key / file['path']).stat().st_size != file['bytes']:
                return None
        return manifest
    except (OSError, ValueError, KeyError, TypeError):
        return None


class Queue:
    def __init__(self, path, capacity=256, output=None):
        self.path = str(path)
        self.capacity = capacity
        self.output = Path(output) if output else None
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS planet_jobs (id TEXT PRIMARY KEY, path TEXT, tile TEXT, state TEXT, priority INTEGER, attempts INTEGER DEFAULT 0, next REAL DEFAULT 0, updated REAL)')
            db.execute("UPDATE planet_jobs SET state='queued' WHERE state='running'")

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def enqueue(self, keys):
        if not isinstance(keys, list) or not 1 <= len(keys) <= 24:
            raise ValueError('Expected 1–24 tile keys')
        cells = [normalize(key) for key in keys]
        now = time.time()
        accepted = 0
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute("DELETE FROM planet_jobs WHERE state='queued' AND updated < ?", (now-600,))
            pending = db.execute("SELECT count(*) FROM planet_jobs WHERE state IN ('queued','running')").fetchone()[0]
            for priority, (identity, path, tile) in enumerate(cells):
                row = db.execute('SELECT * FROM planet_jobs WHERE id=?', (identity,)).fetchone()
                if row:
                    if row['state'] in ('queued', 'running'):
                        db.execute('UPDATE planet_jobs SET priority=?,updated=? WHERE id=?', (priority, now, identity))
                        accepted += 1
                        continue
                    manifest = ready_manifest(self.output, tile) if self.output else None
                    present = self.output is None or bool(manifest and manifest.get('geometryRevision') == 'transport-union-v1')
                    if (row['state'] != 'ready' or present) and now-row['updated'] < (86400 if row['state']=='ready' else 3600):
                        accepted += 1
                        continue
                # Owner-side prewarming can publish a cell before it has a queue row.
                # Adopt that manifest rather than regenerating the same source again.
                manifest = ready_manifest(self.output, tile) if self.output else None
                if not row and manifest and manifest.get('geometryRevision') == 'transport-union-v1':
                    db.execute('INSERT INTO planet_jobs (id,path,tile,state,priority,attempts,next,updated) VALUES (?,?,?,?,?,0,0,?)', (identity,path,tile,'ready',priority,now))
                    accepted += 1
                    continue
                if pending >= self.capacity:
                    continue
                db.execute('INSERT OR REPLACE INTO planet_jobs (id,path,tile,state,priority,attempts,next,updated) VALUES (?,?,?,?,?,0,0,?)', (identity,path,tile,'queued',priority,now))
                pending += 1
                accepted += 1
            db.execute("DELETE FROM planet_jobs WHERE id IN (SELECT id FROM planet_jobs WHERE state IN ('ready','failed') ORDER BY updated DESC LIMIT -1 OFFSET 4096)")
        return accepted

    def claim(self):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute("SELECT * FROM planet_jobs WHERE state='queued' AND next<=? ORDER BY priority,updated DESC LIMIT 1", (time.time(),)).fetchone()
            if row:
                db.execute("UPDATE planet_jobs SET state='running', attempts=attempts+1 WHERE id=?", (row['id'],))
                return dict(row)
        return None

    def finish(self, identity, success):
        with self.connect() as db:
            row = db.execute('SELECT attempts FROM planet_jobs WHERE id=?', (identity,)).fetchone()
            if not row:
                return
            attempts = row['attempts']
            state = 'ready' if success else ('failed' if attempts >= 3 else 'queued')
            db.execute('UPDATE planet_jobs SET state=?, next=?, updated=? WHERE id=?', (state,time.time()+min(900,60*2**attempts),time.time(),identity))

    def stats(self):
        with self.connect() as db:
            return {r['state']:r['count'] for r in db.execute('SELECT state,count(*) AS count FROM planet_jobs GROUP BY state')}
