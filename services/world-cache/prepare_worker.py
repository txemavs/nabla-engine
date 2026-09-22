"""One bounded worker; network queries retain the cache service's upstream pacing."""
import json
import os
import subprocess
import time
from pathlib import Path
from bake import bake_zone
from baked_format import atomic_write

def run(queue, root, publish, limit):
    base = 'http://127.0.0.1:8080'
    script = Path('/app/prepare-dist/services/world-cache/prepare.js')
    publish.mkdir(parents=True, exist_ok=True)
    while True:
        job = queue.claim()
        if not job:
            time.sleep(2)
            continue
        try:
            origin = json.loads(job['origin'])
            x, z = map(int, job['tile'].split('_'))
            extract = bake_zone(origin, x, z, 'Prepared map zone', base)
            # Intermediate input is private, and always regenerated from the cache.
            source = root / 'preparing.json'
            atomic_write(source, extract)
            target = publish / job['path']
            subprocess.run(['node', '--max-old-space-size=512', str(script), str(source), str(target), job['tile'], base], check=True, timeout=180, stdout=subprocess.DEVNULL)
            # Bound prepared output separately; retain the just-completed zone.
            files = sorted(publish.rglob('*.json'), key=lambda p:p.stat().st_mtime)
            total = sum(p.stat().st_size for p in files)
            for path in files:
                if total <= limit:
                    break
                if path == target:
                    continue
                total -= path.stat().st_size
                path.unlink(missing_ok=True)
            queue.finish(job['id'], True)
        except Exception as error:
            print('Preparation failed:', type(error).__name__, flush=True)
            queue.finish(job['id'], False)
