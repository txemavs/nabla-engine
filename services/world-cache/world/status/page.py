"""Operator snapshot for the local tile service.

The page is loopback-only. It reports work the queue was asked to do, the
geographic span of published cells, how many cells are still generating, and
how much disk the cache plus the published tree occupy.
"""
import json
import math
import os
from pathlib import Path

from world.planet.prepare import tile_bounds


def directory_bytes(path):
    total = 0
    if not path.exists():
        return 0
    for directory, _, files in os.walk(path):
        for name in files:
            try:
                total += (Path(directory) / name).stat().st_size
            except OSError:
                pass
    return total


def published_cells(prepare_root):
    cells = []
    base = Path(prepare_root)
    if not base.exists():
        return cells
    for manifest_path in (base / 'z').glob('*/*/*/manifest.json'):
        key = manifest_path.parent.relative_to(base).as_posix()
        try:
            tile, bounds = tile_bounds(key)
            manifest = json.loads(manifest_path.read_text())
        except (OSError, ValueError, KeyError):
            continue
        south, west, north, east = bounds
        files = manifest.get('files') or {}
        terrain = (files.get('terrain') or {}).get('path')
        buildings = (files.get('buildings-osm') or {}).get('path')
        cells.append({
            'tile': key,
            'z': tile['z'],
            'x': tile['x'],
            'y': tile['y'],
            'south': south,
            'west': west,
            'north': north,
            'east': east,
            'terrain': f'/{key}/{terrain}' if terrain else None,
            'buildings': f'/{key}/{buildings}' if buildings else None,
            'photo': f'/tiles/{tile["z"]}/{tile["x"]}/{tile["y"]}.jpg',
            'surface': manifest.get('surface') if manifest.get('surface') in ('land', 'coast', 'sea') else 'land',
            'bytes': sum(int(item.get('bytes') or 0) for item in files.values() if isinstance(item, dict)),
        })
    return cells


def _inside(path, parent):
    try:
        path.resolve().relative_to(parent.resolve())
    except ValueError:
        return False
    return path.resolve() != parent.resolve()


def focus(cells):
    """Centre of the 1° bin that holds the most cells.

    The bounding box is the whole published set. One swapped coordinate would
    drag a midpoint into empty ocean, so the map opens on the dense group.
    """
    bins = {}
    for cell in cells:
        lat = (cell['south'] + cell['north']) / 2
        lon = (cell['west'] + cell['east']) / 2
        bins.setdefault((math.floor(lat), math.floor(lon)), []).append((lat, lon))
    _, points = max(bins.items(), key=lambda item: (len(item[1]), item[0]))
    count = len(points)
    return {
        'latitude': sum(lat for lat, _ in points) / count,
        'longitude': sum(lon for _, lon in points) / count,
    }


def coverage(cells):
    if not cells:
        return None
    return {
        'tiles': len(cells),
        'byZoom': {str(z): sum(1 for cell in cells if cell['z'] == z) for z in (13, 14, 15)},
        'south': min(cell['south'] for cell in cells),
        'west': min(cell['west'] for cell in cells),
        'north': max(cell['north'] for cell in cells),
        'east': max(cell['east'] for cell in cells),
        'focus': focus(cells),
    }


def latest_cell(prepare_root):
    """Newest published manifest. The GLB itself may already live only in S3."""
    best = None
    base = Path(prepare_root)
    if not (base / 'z').exists():
        return None
    for manifest_path in (base / 'z').glob('*/*/*/manifest.json'):
        try:
            mtime = manifest_path.stat().st_mtime
        except OSError:
            continue
        if best is not None and mtime <= best[0]:
            continue
        try:
            manifest = json.loads(manifest_path.read_text())
            files = manifest['files']
            tile = manifest_path.parent.relative_to(base).as_posix()
            _, z, x, y = tile.split('/')
        except (OSError, ValueError, KeyError):
            continue
        best = (mtime, {
            'tile': tile,
            'terrain': f'/{tile}/{files["terrain"]["path"]}',
            'buildings': f'/{tile}/{files["buildings-osm"]["path"]}',
            'photo': f'/tiles/{z}/{x}/{y}.jpg',
            'stamp': int((manifest_path.parent / 'preview.jpg').stat().st_mtime)
            if (manifest_path.parent / 'preview.jpg').is_file() else int(mtime),
        })
    return None if best is None else best[1]


def conversion_progress():
    """The colour rebuild writes /tmp/regen-colours.log. Absent means it is not running."""
    path = Path('/tmp/regen-colours.log')
    if not path.is_file():
        return None
    total = done = 0
    current = None
    finished = False
    try:
        lines = path.read_text(errors='replace').splitlines()
    except OSError:
        return None
    for line in lines:
        if line.startswith('cells '):
            try:
                total = int(line.split()[1])
            except ValueError:
                pass
        elif line.startswith('start '):
            current = line.split(maxsplit=1)[1]
        elif line.startswith(('done ', 'fail ', 'skip ')):
            done += 1
        elif line.strip() == 'finished':
            finished = True
    if not total and not done:
        return None
    left = max(0, total - done)
    return {
        'active': not finished and left > 0,
        'done': done,
        'total': total,
        'left': left,
        'current': current,
    }


def photo_progress():
    """The photo regen writes /tmp/photo-regen.json. The three counters follow it."""
    path = Path('/tmp/photo-regen.json')
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return None
    if not data.get('active'):
        return None
    return data


def service_snapshot(cache_root, prepare_root, queue):
    cache_root = Path(cache_root)
    prepare_root = Path(prepare_root)
    cells = published_cells(prepare_root)
    cache_bytes = directory_bytes(cache_root)
    publish_bytes = directory_bytes(prepare_root)
    # Separate volumes are the normal layout. If one tree sits inside the
    # other, the outer walk already counted the inner files.
    if prepare_root == cache_root or _inside(prepare_root, cache_root):
        total = cache_bytes
        cache_bytes = max(0, cache_bytes - publish_bytes)
    elif _inside(cache_root, prepare_root):
        total = publish_bytes
        publish_bytes = max(0, publish_bytes - cache_bytes)
    else:
        total = cache_bytes + publish_bytes
    stats = queue.stats() if queue else {}
    photo = photo_progress()
    if photo:
        stats = {
            'queued': int(photo.get('queued') or 0),
            'running': int(photo.get('running') or 0),
            'ready': int(photo.get('ready') or 0),
            'failed': int(stats.get('failed') or 0),
        }
    generating = int(stats.get('queued') or 0) + int(stats.get('running') or 0)
    return {
        'generationEnabled': queue is not None,
        'queue': {
            'generating': generating,
            'queued': int(stats.get('queued') or 0),
            'running': int(stats.get('running') or 0),
            'ready': int(stats.get('ready') or 0),
            'failed': int(stats.get('failed') or 0),
        },
        'requests': queue.recent() if queue else [],
        'coverage': coverage(cells),
        'cells': sorted(cells, key=lambda cell: (cell['z'], cell['x'], cell['y'])),
        'disk': {
            'bytes': total,
            'gigabytes': total / (1024 ** 3),
            'cacheBytes': cache_bytes,
            'publishedBytes': publish_bytes,
        },
        'latest': latest_cell(prepare_root),
        'conversion': conversion_progress(),
    }


def render_status_page(data):
    blob = json.dumps(data).replace('<', '\\u003c')
    return f'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nabla World</title>
<style>
  body {{ margin: 0; font: 15px/1.45 ui-sans-serif, system-ui, sans-serif; background: #111; color: #eee; }}
  main {{ max-width: 920px; margin: 0 auto; padding: 28px 20px 48px; }}
  h1 {{ font-size: 22px; font-weight: 600; margin: 0 0 4px; }}
  p.lead {{ color: #9aa; margin: 0 0 22px; }}
  .stats {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }}
  .stat {{ background: #1c1c1c; padding: 14px; }}
  .stat b {{ display: block; font-size: 22px; font-weight: 600; }}
  .stat span {{ color: #9aa; font-size: 12px; }}
  h2 {{ font-size: 15px; margin: 28px 0 8px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th, td {{ text-align: left; padding: 6px 8px; border-bottom: 1px solid #2a2a2a; font-variant-numeric: tabular-nums; }}
  th {{ color: #9aa; font-weight: 500; }}
  .empty {{ color: #9aa; }}
  a {{ color: #9cf; }}
  .preview {{ display: grid; grid-template-columns: 1.4fr 0.8fr; gap: 12px; margin-top: 18px; }}
  .stage {{ position: relative; background: #1a1a1a; min-height: 460px; }}
  canvas {{ width: 100%; height: 460px; display: block; }}
  .shot {{ width: 100%; height: 460px; object-fit: contain; background: #1a1a1a; }}
  .caption {{ color: #9aa; font-size: 13px; margin: 8px 0 0; }}
  @media (max-width: 700px) {{
    .stats {{ grid-template-columns: 1fr 1fr; }}
    .preview {{ grid-template-columns: 1fr; }}
  }}
</style>
</head>
<body>
<main>
  <h1>Nabla World</h1>
  <p class="lead">Servicio de teselas. Esta página se actualiza sola. <a href="/map">Mapa</a></p>
  <p id="convert" class="caption"></p>
  <div class="preview">
    <div>
      <div class="stage"><canvas id="view"></canvas></div>
      <p id="glb-caption" class="caption">Arrastra para orbitar. La rueda acerca y aleja.</p>
    </div>
    <div>
      <img id="photo" class="shot" alt="Última foto">
      <p id="photo-caption" class="caption"></p>
    </div>
  </div>
  <section class="stats" id="stats"></section>
  <h2>Cobertura publicada</h2>
  <p id="coverage" class="empty"></p>
  <h2>Pedidos</h2>
  <table>
    <thead><tr><th>Celda</th><th>Estado</th><th>Intentos</th></tr></thead>
    <tbody id="requests"></tbody>
  </table>
</main>
<script>
const initial = {blob};
function gigabytes(n) {{ return (n / 1073741824).toFixed(2) + ' GB'; }}
function draw(data) {{
  const q = data.queue;
  const disk = data.disk;
  document.getElementById('stats').innerHTML = [
    [q.generating, 'en cola o generando'],
    [q.running, 'generando ahora'],
    [q.ready, 'listas'],
    [gigabytes(disk.bytes), 'en disco'],
  ].map(([value, label]) => '<div class="stat"><b>' + value + '</b><span>' + label + '</span></div>').join('');
  const cover = data.coverage;
  document.getElementById('coverage').textContent = cover
    ? cover.tiles + ' teselas. Sur ' + cover.south.toFixed(3) + '°, oeste ' + cover.west.toFixed(3) + '°, norte ' + cover.north.toFixed(3) + '°, este ' + cover.east.toFixed(3) + '°. Zoom 13/14/15: ' + cover.byZoom['13'] + ' / ' + cover.byZoom['14'] + ' / ' + cover.byZoom['15'] + '.'
    : 'Todavía no hay ninguna celda publicada.';
  const sea = new Set((data.cells || []).filter(cell => cell.surface === 'sea').map(cell => cell.tile));
  const coast = new Set((data.cells || []).filter(cell => cell.surface === 'coast').map(cell => cell.tile));
  const label = (row) => row.state === 'ready' && sea.has(row.tile) ? 'mar' : row.state === 'ready' && coast.has(row.tile) ? 'costa' : row.state;
  const body = document.getElementById('requests');
  body.innerHTML = data.requests.length
    ? data.requests.map(row => '<tr><td>' + row.tile + '</td><td>' + label(row) + '</td><td>' + row.attempts + '</td></tr>').join('')
    : '<tr><td colspan="3" class="empty">' + (data.generationEnabled ? 'Nadie ha pedido celdas.' : 'La generación está apagada: no hay PREPARE_TOKEN.') + '</td></tr>';
}}
draw(initial);
let shown = '';
function showLatest(data) {{
  const job = data.conversion;
  const line = document.getElementById('convert');
  line.textContent = !job ? '' : job.active
    ? 'Convirtiendo colores. Hechas ' + job.done + ' de ' + job.total + '. Quedan ' + job.left + (job.current ? '. Ahora ' + job.current : '') + '.'
    : 'Conversión parada. Hechas ' + job.done + ' de ' + job.total + '.';
  const latest = data.latest;
  const photo = document.getElementById('photo');
  if (!latest) {{
    document.getElementById('glb-caption').textContent = 'Todavía no hay una celda publicada.';
    document.getElementById('photo-caption').textContent = '';
    photo.removeAttribute('src');
    return;
  }}
  document.getElementById('photo-caption').textContent = 'Foto ' + latest.tile;
  photo.src = latest.photo + '?t=' + latest.stamp;
  const key = latest.terrain + '|' + latest.buildings;
  if (key === shown) return;
  shown = key;
  document.getElementById('glb-caption').textContent = 'GLB ' + latest.tile + '. Arrastra para orbitar. La rueda acerca y aleja.';
  window.loadCell && window.loadCell(latest);
}}
showLatest(initial);
setInterval(() => fetch('/status.json').then(r => r.json()).then(data => {{ draw(data); showLatest(data); }}).catch(() => {{}}), 5000);
</script>
<script type="importmap">
{{"imports":{{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}}}
</script>
<script type="module">
import * as THREE from 'three';
import {{ OrbitControls }} from 'three/addons/controls/OrbitControls.js';
import {{ GLTFLoader }} from 'three/addons/loaders/GLTFLoader.js';
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({{ canvas, antialias: true }});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1a1a1a');
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 20000);
camera.position.set(400, 500, 400);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 0, 0);
scene.add(new THREE.HemisphereLight('#ffffff', '#3a4030', 1.2));
const sun = new THREE.DirectionalLight('#ffffff', 1.6);
sun.position.set(300, 800, 200);
scene.add(sun);
const root = new THREE.Group();
scene.add(root);
const loader = new GLTFLoader();
function resize() {{
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {{
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }}
}}
function frame(object) {{
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const span = Math.max(size.x, size.y, size.z, 1);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(span, span * 0.85, span));
  camera.near = span / 200;
  camera.far = span * 40;
  camera.updateProjectionMatrix();
  controls.update();
}}
window.loadCell = async (latest) => {{
  while (root.children.length) {{
    const child = root.children.pop();
    child.traverse(node => {{ if (node.geometry) node.geometry.dispose(); }});
  }}
  for (const url of [latest.terrain, latest.buildings]) {{
    try {{
      const gltf = await loader.loadAsync(url);
      root.add(gltf.scene);
    }} catch (error) {{
      document.getElementById('glb-caption').textContent = 'GLB ' + latest.tile + ' · ' + error;
    }}
  }}
  frame(root);
}};
if (initial.latest) window.loadCell(initial.latest);
renderer.setAnimationLoop(() => {{ resize(); controls.update(); renderer.render(scene, camera); }});
</script>
</body>
</html>
'''
