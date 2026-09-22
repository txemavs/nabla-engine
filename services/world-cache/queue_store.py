"""Bounded durable demand queue. No user-provided URL or filesystem path is accepted."""
import hashlib
import json
import math
import sqlite3
import time
from pathlib import Path

VERSION = '4'

def normalize(origin, key):
    if not isinstance(origin, dict) or not isinstance(key, str):
        raise ValueError('Invalid zone')
    lat, lon, alt = (origin.get(k) for k in ('latitude', 'longitude', 'altitude'))
    if any(type(v) not in (int, float) or not math.isfinite(v) for v in (lat, lon, alt)):
        raise ValueError('Invalid origin')
    if not -80 <= lat <= 80 or not -180 <= lon <= 180 or not -500 <= alt <= 10000:
        raise ValueError('Origin outside supported terrain bounds')
    import re
    if not re.fullmatch(r'-?\d{1,5}_-?\d{1,5}', key):
        raise ValueError('Invalid tile')
    x, z = map(int, key.split('_'))
    # Refuse work outside the supported Mercator terrain band.
    center_lon = lon + x * 1200 / (6371000 * math.cos(lat * math.pi / 180)) * 180 / math.pi
    if abs(lat - z * 1200 / 6371000 * 180 / math.pi) > 80 or abs(center_lon) > 180:
        raise ValueError('Zone outside supported latitude')
    path = f'{VERSION}/{lat:.6f}/{lon:.6f}/{alt:.3f}/{x}_{z}.json'
    identity = hashlib.sha256(path.encode()).hexdigest()
    return identity, path, dict(latitude=lat, longitude=lon, altitude=alt), f'{x}_{z}'

class Queue:
    def __init__(self, path, capacity=256, output=None):
        self.path = str(path)
        self.capacity = capacity
        self.output = Path(output) if output else None
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, path TEXT, origin TEXT, tile TEXT, state TEXT, priority INTEGER, attempts INTEGER DEFAULT 0, next REAL DEFAULT 0, updated REAL)')
            db.execute("UPDATE jobs SET state='queued' WHERE state='running'")

    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        return db

    def enqueue(self, origin, keys):
        if not isinstance(keys, list) or not 1 <= len(keys) <= 24:
            raise ValueError('Expected 1–24 tile keys')
        zones = [normalize(origin, key) for key in keys]
        now = time.time()
        accepted = 0
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            pending = db.execute("SELECT count(*) FROM jobs WHERE state IN ('queued','running')").fetchone()[0]
            for priority, (identity, path, point, tile) in enumerate(zones):
                row = db.execute('SELECT * FROM jobs WHERE id=?', (identity,)).fetchone()
                if row:
                    if row['state'] in ('queued', 'running'):
                        db.execute('UPDATE jobs SET priority=min(priority,?) WHERE id=?', (priority, identity))
                        accepted += 1
                        continue
                    present = self.output is None or (self.output / row['path']).is_file()
                    if (row['state'] != 'ready' or present) and now - row['updated'] < (86400 if row['state']=='ready' else 3600):
                        accepted += 1
                        continue
                if pending >= self.capacity:
                    continue
                db.execute('INSERT OR REPLACE INTO jobs (id,path,origin,tile,state,priority,attempts,next,updated) VALUES (?,?,?,?,?,?,0,0,?)',
                           (identity, path, json.dumps(point), tile, 'queued', priority, now))
                pending += 1
                accepted += 1
            # Bound completed history as well as pending work.
            db.execute("DELETE FROM jobs WHERE id IN (SELECT id FROM jobs WHERE state IN ('ready','failed') ORDER BY updated DESC LIMIT -1 OFFSET 4096)")
        return accepted

    def claim(self):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute("SELECT * FROM jobs WHERE state='queued' AND next<=? ORDER BY priority,updated LIMIT 1", (time.time(),)).fetchone()
            if row:
                db.execute("UPDATE jobs SET state='running', attempts=attempts+1 WHERE id=?", (row['id'],))
                return dict(row)
        return None

    def finish(self, identity, success):
        with self.connect() as db:
            row = db.execute('SELECT attempts FROM jobs WHERE id=?', (identity,)).fetchone()
            if not row:
                return
            attempts = row['attempts']
            state = 'ready' if success else ('failed' if attempts >= 3 else 'queued')
            db.execute('UPDATE jobs SET state=?, next=?, updated=? WHERE id=?', (state, time.time()+min(900,60*2**attempts), time.time(), identity))

    def stats(self):
        with self.connect() as db:
            return {r['state']:r['count'] for r in db.execute('SELECT state,count(*) AS count FROM jobs GROUP BY state')}
