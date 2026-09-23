"""One bounded native XYZ worker. Local-grid generation is retired."""
import json
import time
import shutil
from pathlib import Path
from prepare_planet import prepare


def trim_prepared(publish, target, limit):
    directories = [p.parent for p in (publish / 'z').glob('*/*/*/manifest.json')]
    sizes = {d: sum(p.stat().st_size for p in d.iterdir() if p.is_file()) for d in directories}
    total = sum(sizes.values())
    for directory in sorted(directories, key=lambda d: (d / 'manifest.json').stat().st_mtime):
        if total <= limit:
            break
        if directory == target.parent:
            continue
        shutil.rmtree(directory)
        total -= sizes[directory]


def run(queue, root, publish, limit):
    publish.mkdir(parents=True, exist_ok=True)
    publisher = Path('/app/prepare-dist/services/world-cache/prepare-planet.js')
    while True:
        job = queue.claim()
        if not job:
            time.sleep(2)
            continue
        started = time.monotonic()
        print('Planet preparation started:', job['tile'], flush=True)
        try:
            prepare(job['tile'], publish, 'http://127.0.0.1:8080', publisher)
            trim_prepared(publish, publish / job['path'], limit)
            queue.finish(job['id'], True)
            print('Planet preparation ready:', job['tile'], f'{time.monotonic()-started:.1f}s', flush=True)
        except Exception as error:
            print('Planet preparation failed:', job['tile'], type(error).__name__, flush=True)
            queue.finish(job['id'], False)
