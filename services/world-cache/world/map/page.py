"""Browser page: NASA and a free imagery base, then our JPEGs from zoom 13."""


def render_map_page():
    return r'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nabla World — mapa</title>
<style>
  html, body { margin: 0; height: 100%; background: #0c1218; color: #eee; font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; }
  header { display: flex; gap: 16px; align-items: center; padding: 10px 14px; background: #1b1b1b; }
  a { color: #9cf; }
  #view { position: absolute; left: 0; top: 46px; width: 100%; height: calc(100vh - 74px); cursor: grab; touch-action: none; }
  #note { position: absolute; left: 14px; bottom: 32px; background: #1b1b1bcc; padding: 8px 10px; max-width: 460px; }
  footer { position: absolute; left: 0; right: 0; bottom: 0; padding: 4px 14px; color: #9ab; font-size: 11px; background: #1b1b1bcc; }
</style>
</head>
<body>
<header>
  <b>Nabla World</b>
  <span id="zoom"></span>
  <a href="/map/3d">3D</a>
  <a href="/">estado</a>
</header>
<canvas id="view"></canvas>
<p id="note">Arrastra para moverte. La rueda acerca y aleja, del mundo entero hasta el zoom 15. A partir del 13, un clic pide la celda nuestra.</p>
<footer id="credit"></footer>
<script>
const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const note = document.getElementById('note');
const TILE = 256;
const MIN_Z = 1;
const MAX_Z = 15;
let z = 2, cx = 0.5, cy = 0.48;
const images = new Map();

function resize() {
  const width = window.innerWidth;
  const height = Math.max(1, window.innerHeight - 74);
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvas.width = width;
  canvas.height = height;
  draw();
}
function wrapX(x, n) { return ((x % n) + n) % n; }
function baseUrl(level, x, y) {
  if (level <= 8) {
    return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/' + level + '/' + y + '/' + x + '.jpeg';
  }
  return 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + level + '/' + y + '/' + x;
}
function oursUrl(level, x, y) {
  return '/tiles/' + level + '/' + x + '/' + y + '.jpg';
}
function loadImage(id, url) {
  let entry = images.get(id);
  if (entry) return entry;
  const img = new Image();
  entry = { img, ok: false, failed: false };
  img.onload = () => { entry.ok = true; draw(); };
  img.onerror = () => { entry.failed = true; };
  img.src = url;
  images.set(id, entry);
  return entry;
}
function paint(url, id, px, py) {
  const entry = loadImage(id, url);
  if (entry.ok) ctx.drawImage(entry.img, px, py, TILE, TILE);
  return entry.ok;
}
function draw() {
  const n = 2 ** z;
  ctx.fillStyle = '#0c1218';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const x0 = Math.floor(cx * n - canvas.width / 2 / TILE) - 1;
  const y0 = Math.floor(cy * n - canvas.height / 2 / TILE) - 1;
  const x1 = Math.ceil(cx * n + canvas.width / 2 / TILE) + 1;
  const y1 = Math.ceil(cy * n + canvas.height / 2 / TILE) + 1;
  for (let y = y0; y <= y1; y++) {
    if (y < 0 || y >= n) continue;
    for (let x = x0; x <= x1; x++) {
      const wrapped = wrapX(x, n);
      const px = (x - cx * n) * TILE + canvas.width / 2;
      const py = (y - cy * n) * TILE + canvas.height / 2;
      paint(baseUrl(z, wrapped, y), 'base/' + z + '/' + wrapped + '/' + y, px, py);
      if (z >= 13) {
        const own = paint(oursUrl(z, wrapped, y), 'ours/' + z + '/' + wrapped + '/' + y, px, py);
        if (!own) {
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
        }
      }
    }
  }
  const source = z <= 8 ? 'NASA Blue Marble' : z <= 12 ? 'Esri World Imagery' : 'Esri de fondo, celdas nuestras encima';
  document.getElementById('zoom').textContent = 'zoom ' + z;
  document.getElementById('credit').textContent = source + (z <= 8
    ? ' · NASA GIBS'
    : ' · Esri, Maxar, Earthstar Geographics');
}
function zoomAt(next, clientX, clientY) {
  next = Math.max(MIN_Z, Math.min(MAX_Z, next));
  if (next === z) return;
  const box = canvas.getBoundingClientRect();
  const px = clientX - box.left;
  const py = clientY - box.top;
  const n = 2 ** z;
  const wx = cx + (px - canvas.width / 2) / TILE / n;
  const wy = cy + (py - canvas.height / 2) / TILE / n;
  z = next;
  const n2 = 2 ** z;
  cx = wx - (px - canvas.width / 2) / TILE / n2;
  cy = Math.max(0, Math.min(1, wy - (py - canvas.height / 2) / TILE / n2));
  draw();
}
addEventListener('resize', resize);
canvas.addEventListener('wheel', (event) => {
  event.preventDefault();
  const step = event.deltaY > 0 ? -1 : 1;
  zoomAt(z + step, event.clientX, event.clientY);
}, { passive: false });
let drag = null;
canvas.addEventListener('pointerdown', (event) => {
  drag = { x: event.clientX, y: event.clientY, cx, cy, moved: false };
  canvas.setPointerCapture(event.pointerId);
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', (event) => {
  if (!drag) return;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 3) drag.moved = true;
  const n = 2 ** z;
  cx = drag.cx - (event.clientX - drag.x) / TILE / n;
  cy = Math.max(0, Math.min(1, drag.cy - (event.clientY - drag.y) / TILE / n));
  draw();
});
canvas.addEventListener('pointerup', async (event) => {
  canvas.style.cursor = 'grab';
  const moved = drag && drag.moved;
  drag = null;
  if (moved || z < 13) return;
  const box = canvas.getBoundingClientRect();
  const n = 2 ** z;
  const x = Math.floor(cx * n + (event.clientX - box.left - canvas.width / 2) / TILE);
  const y = Math.floor(cy * n + (event.clientY - box.top - canvas.height / 2) / TILE);
  if (y < 0 || y >= n) return;
  const tile = 'z/' + z + '/' + wrapX(x, n) + '/' + y;
  note.textContent = 'Pedido ' + tile + '…';
  const response = await fetch('/map/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tile }),
  });
  const body = await response.json().catch(() => ({}));
  note.textContent = response.ok
    ? tile + ' en cola. La foto tapa el fondo cuando el GLB está listo.'
    : (body.error || 'No se ha podido pedir la celda.');
});
async function refresh() {
  const data = await fetch('/status.json').then(r => r.json()).catch(() => null);
  if (!data) return;
  let dirty = false;
  for (const cell of data.cells || []) {
    const id = 'ours/' + cell.z + '/' + cell.x + '/' + cell.y;
    const entry = images.get(id);
    if (entry && !entry.ok) {
      entry.failed = false;
      entry.img.src = oursUrl(cell.z, cell.x, cell.y) + '?t=' + Date.now();
      dirty = true;
    }
  }
  if (dirty) draw();
}
setInterval(refresh, 4000);
fetch('/status.json').then(r => r.json()).then(data => {
  const focus = data.coverage && data.coverage.focus;
  if (focus) {
    cx = (focus.longitude + 180) / 360;
    cy = (1 - Math.asinh(Math.tan(focus.latitude * Math.PI / 180)) / Math.PI) / 2;
    z = 13;
  }
  resize();
}).catch(resize);
</script>
</body>
</html>
'''
