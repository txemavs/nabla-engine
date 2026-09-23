"""One bounded worker; network queries retain the cache service's upstream pacing."""
import json
import os
import subprocess
import shutil
import time
from pathlib import Path
from bake import bake_zone
from baked_format import atomic_write

def trim_prepared(publish, target, limit):
    """Count both formats and evict old zone pairs, retaining the current job."""
    files = [p for p in publish.rglob('*') if p.is_file() and p.suffix in ('.json', '.bin', '.glb')]
    total = sum(p.stat().st_size for p in files)
    groups = {}
    for path in files:
        sidecar = next((parent for parent in path.parents if parent.name.endswith('.glb-tile')), None)
        key = sidecar.with_suffix('.json') if sidecar else path.with_suffix('.json')
        groups.setdefault(key, []).append(path)
    for key, paths in sorted(groups.items(), key=lambda item: min(p.stat().st_mtime for p in item[1])):
        if total <= limit:
            break
        if key == target:
            continue
        for path in paths:
            total -= path.stat().st_size
            path.unlink(missing_ok=True)
        sidecar = key.with_suffix('.glb-tile')
        if sidecar.is_dir():
            shutil.rmtree(sidecar)



def sidecar_current(target):
    folder = target.with_suffix('.glb-tile')
    try:
        manifest = json.loads((folder / 'manifest.json').read_text())
        return (manifest.get('groundRevision') == 2 and
                (folder / 'manifest.json').stat().st_mtime >= target.with_suffix('.bin').stat().st_mtime and
                all((folder / name).is_file() for name in ('terrain.glb', 'buildings-osm.glb')))
    except (OSError, ValueError):
        return False

def prepare_sidecar(target, root, exporter):
    if not exporter.exists():
        return False
    sidecar = target.with_suffix('.glb-tile')
    staging = root / 'preparing-glb'
    shutil.rmtree(staging, ignore_errors=True)
    try:
        subprocess.run(['node', '--max-old-space-size=512', str(exporter), str(target.with_suffix('.bin')), str(staging)], check=True, timeout=180, stdout=subprocess.DEVNULL)
        sidecar.mkdir(parents=True, exist_ok=True)
        for artifact in staging.iterdir():
            if artifact.name not in ('tile.glb', 'source.bin', 'manifest.json'):
                temporary = sidecar / (artifact.name + '.next')
                shutil.copyfile(artifact, temporary)
                temporary.replace(sidecar / artifact.name)
        shutil.copyfile(staging / 'manifest.json', sidecar / 'manifest.next')
        (sidecar / 'manifest.next').replace(sidecar / 'manifest.json')
        print('GLB prepared:', target.name, flush=True)
        return True
    except Exception as error:
        print('GLB preparation skipped:', type(error).__name__, flush=True)
        return False
    finally:
        shutil.rmtree(staging, ignore_errors=True)


def run(queue, root, publish, limit):
    base = 'http://127.0.0.1:8080'
    script = Path('/app/prepare-dist/services/world-cache/prepare.js')
    publish.mkdir(parents=True, exist_ok=True)
    retry_after = {}
    while True:
        job = queue.claim()
        if not job:
            # Migrate resident binaries while idle, without querying OSM or elevation.
            candidate = next((p.with_suffix('.json') for p in publish.rglob('*.bin')
                              if retry_after.get(str(p), 0) <= time.time() and not sidecar_current(p)), None)
            if candidate:
                binary = str(candidate.with_suffix('.bin'))
                retry_after[binary] = time.time() + 300
                prepare_sidecar(candidate, root, script.with_name('export-tile-glb.js'))
                trim_prepared(publish, candidate, limit)
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
            prepare_sidecar(target, root, script.with_name('export-tile-glb.js'))
            trim_prepared(publish, target, limit)
            queue.finish(job['id'], True)
        except Exception as error:
            print('Preparation failed:', type(error).__name__, flush=True)
            queue.finish(job['id'], False)
