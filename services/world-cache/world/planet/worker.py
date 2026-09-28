"""One bounded native XYZ worker. Local-grid generation is retired."""
import json
import time
import shutil
from urllib.error import HTTPError
from pathlib import Path
from world.planet.prepare import prepare


def release_payload(directory):
    """Drop the heavy files. The manifest and the preview stay, so the map still knows the cell."""
    if not directory.is_dir():
        return
    for path in directory.iterdir():
        if path.is_file() and (path.suffix == '.glb' or path.name == 'roof.jpg'):
            path.unlink()


def trim_prepared(publish, target, limit, keep_index=False):
    directories = [p.parent for p in (publish / 'z').glob('*/*/*/manifest.json')]
    sizes = {d: sum(p.stat().st_size for p in d.iterdir() if p.is_file()) for d in directories}
    total = sum(sizes.values())
    for directory in sorted(directories, key=lambda d: (d / 'manifest.json').stat().st_mtime):
        if total <= limit:
            break
        if directory == target.parent:
            continue
        if keep_index:
            from world.archive.store import archived
            if archived(directory):
                before = sizes[directory]
                release_payload(directory)
                sizes[directory] = sum(p.stat().st_size for p in directory.iterdir() if p.is_file())
                total -= before - sizes[directory]
            continue
        shutil.rmtree(directory)
        total -= sizes[directory]


def failure_detail(error):
    if isinstance(error, HTTPError):
        detail = f'OSM cache HTTP {error.code}'
        try:
            status = json.loads(error.read(4096)).get('upstreamStatus')
            if isinstance(status, int):
                detail += f' (provider HTTP {status})'
        except (ValueError, OSError, AttributeError):
            pass
        return detail
    return type(error).__name__


def release_archived(publish):
    from world.archive.store import archived
    for manifest in (publish / 'z').glob('*/*/*/manifest.json'):
        cell = manifest.parent
        if archived(cell):
            release_payload(cell)
            print('Planet cell now served from S3:', cell.relative_to(publish).as_posix(), flush=True)


def run(queue, root, publish, limit):
    publish.mkdir(parents=True, exist_ok=True)
    publisher = Path('/app/prepare-dist/services/world-cache/planet/prepare-planet.js')
    from world.archive.store import enabled
    if enabled():
        release_archived(publish)
    while True:
        job = queue.claim()
        if not job:
            time.sleep(2)
            continue
        started = time.monotonic()
        print('Planet preparation started:', job['tile'], flush=True)
        try:
            from world.archive.store import complete, enabled, pull
            cell = publish / job['tile']
            if pull(cell, {'manifest.json', 'preview.jpg'}):
                release_payload(cell)
                queue.finish(job['id'], True)
                print('Planet cell fetched:', job['tile'], f'{time.monotonic()-started:.1f}s', flush=True)
                continue
            prepare(job['tile'], publish, 'http://127.0.0.1:8080', publisher)
            from world.photo.shot import compose_above, shoot
            from world.photo.roofs import write_roof
            shoot(cell)
            compose_above(cell)
            write_roof(cell)
            if complete(cell):
                release_payload(cell)
                print('Planet cell stored in S3:', job['tile'], flush=True)
            trim_prepared(publish, publish / job['path'], limit, keep_index=enabled())
            queue.finish(job['id'], True)
            surface = 'land'
            try:
                surface = json.loads((cell / 'manifest.json').read_text()).get('surface') or 'land'
            except (OSError, ValueError):
                pass
            kind = {'sea': 'sea, no elevation', 'coast': 'coast, partial elevation'}.get(surface, 'land')
            print('Planet preparation ready:', job['tile'], kind, f'{time.monotonic()-started:.1f}s', flush=True)
        except Exception as error:
            print('Planet preparation failed:', job['tile'], failure_detail(error), '· queue retry/backoff applies', flush=True)
            queue.finish(job['id'], False)
