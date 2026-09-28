"""Travel map of published GLBs. Starts over Irún. The switch shows the photo instead."""


def render_map3d_page():
    return r'''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nabla World — mapa 3D</title>
<style>
  html, body { margin: 0; height: 100%; background: #0c1218; color: #eee; font: 14px/1.4 ui-sans-serif, system-ui, sans-serif; }
  header { display: flex; gap: 16px; align-items: center; padding: 10px 14px; background: #1b1b1b; }
  header label { display: flex; gap: 8px; align-items: center; color: #ddd; }
  #caption { color: #fff; font: 700 15px/1.2 ui-monospace, monospace; }
  header input { width: 160px; }
  a, button { color: #9cf; background: none; border: 0; font: inherit; cursor: pointer; padding: 0; }
  button.on { color: #fff; }
  #view { position: absolute; left: 0; top: 46px; width: 100%; height: calc(100vh - 46px); touch-action: none; }
  #note { position: absolute; left: 14px; bottom: 14px; background: #1b1b1bcc; padding: 8px 10px; max-width: 520px; }
</style>
</head>
<body>
<header>
  <b>Nabla World</b>
  <span id="caption">z/…</span>
  <button id="zoom-13" type="button">z13</button>
  <button id="zoom-14" type="button">z14</button>
  <button id="zoom-15" class="on" type="button">z15</button>
  <button id="mode-glb" class="on" type="button">GLB</button>
  <button id="mode-photo" type="button">Foto</button>
  <label>Hora <input id="hour" type="range" min="0" max="24" step="0.25" value="16"><output id="hour-label">16:00</output></label>
  <a href="/map">mapa</a>
  <a href="/">estado</a>
</header>
<canvas id="view"></canvas>
<p id="note">Arranca en Irún. Arrastra para moverte, rueda para acercarte, botón derecho para girar.</p>
<script type="importmap">
{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"}}
</script>
<script type="module">
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const IRUN = { lat: 43.3213, lon: -1.83119 };
const R = 6378137;
const lat0 = IRUN.lat * Math.PI / 180;
const scale = Math.cos(lat0);
const ty0 = (1 - Math.asinh(Math.tan(lat0)) / Math.PI) / 2;
const note = document.getElementById('note');
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9ebbd4');
const camera = new THREE.PerspectiveCamera(45, 1, 1, 200000);
const controls = new MapControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2.05;
controls.target.set(0, 0, 0);
camera.position.set(900, 700, 900);
scene.add(new THREE.AmbientLight('#dce7f5', 0.22));
const sun = new THREE.DirectionalLight('#fff0d8', 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);
let hour = 16;
const world = new THREE.Group();
scene.add(world);
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const placed = new Map();
let mode = 'glb';
let zoom = 15;
let cells = [];

function place(lat, lon) {
  const ty = (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2;
  return new THREE.Vector3(
    (lon - IRUN.lon) * Math.PI / 180 * R * scale,
    0,
    (ty - ty0) * 2 * Math.PI * R * scale,
  );
}
function sunAt(date) {
  const rad = Math.PI / 180;
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545;
  const t = n / 36525;
  const gmst = 280.46061837 + 360.98564736629 * n + 0.000387933 * t * t;
  const eps = (23.439 - 4e-7 * n) * rad;
  const g = (357.528 + 0.9856003 * n) * rad;
  const lambda = (280.46 + 0.9856474 * n + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const cl = Math.cos(dec);
  const lon = ra - gmst * rad;
  const sun = new THREE.Vector3(cl * Math.cos(lon), Math.sin(dec), -cl * Math.sin(lon)).normalize();
  const lat = IRUN.lat * rad, ln = IRUN.lon * rad;
  const east = new THREE.Vector3(-Math.sin(ln), 0, -Math.cos(ln));
  const up = new THREE.Vector3(Math.cos(lat) * Math.cos(ln), Math.sin(lat), -Math.cos(lat) * Math.sin(ln));
  const south = new THREE.Vector3(Math.sin(lat) * Math.cos(ln), -Math.cos(lat), -Math.sin(lat) * Math.sin(ln));
  const frame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, up, south));
  return sun.applyQuaternion(frame.invert());
}
function aimSun() {
  const dir = sunAt(new Date(Date.parse('2026-06-21T00:00:00+02:00') + hour * 3600000));
  const focus = controls.target;
  sun.target.position.copy(focus);
  sun.position.copy(focus).addScaledVector(dir, 2500);
  const up = Math.max(0, dir.y);
  sun.intensity = 3.2 * Math.min(1, up * 1.6);
  sun.color.set(up > 0.15 ? '#fff0d8' : '#b8ccff');
  const radius = Math.min(1600, Math.max(220, camera.position.distanceTo(focus) * 0.4));
  const cam = sun.shadow.camera;
  cam.left = -radius;
  cam.right = radius;
  cam.top = radius;
  cam.bottom = -radius;
  cam.near = 50;
  cam.far = 5000;
  cam.updateProjectionMatrix();
}
const SURFACE = { default: 1, residential: 2, industrial: 3, farmland: 4, forest: 5, scrub: 6, wetland: 7, rock: 8, sand: 9, grass: 10, water: 11 };
function restoreLayers(root) {
  root.traverse(object => {
    if (!object.isMesh) return;
    const category = object.userData.category || object.name;
    let layer = Number(object.userData.groundLayer) || 0;
    if (category === 'Roads' && layer <= 0) layer = object.userData.transport === 'ballast' ? 14 : object.userData.transport === 'rail' ? 15 : 13;
    for (const material of [].concat(object.material)) {
      material.roughness = 1;
      material.metalness = 0;
      material.envMapIntensity = 0;
      material.depthWrite = !(category === 'Surfaces' && layer !== SURFACE.water);
      material.polygonOffset = layer > 0;
      material.polygonOffsetFactor = material.polygonOffsetUnits = -layer;
    }
    object.castShadow = category === 'Buildings';
    object.receiveShadow = category !== 'Skirt';
    object.renderOrder = layer;
  });
}
function dressRoofs(group, cell) {
  if (cell.z !== 15) return;
  const width = span(cell);
  let xyz = [];
  group.traverse(mesh => {
    if (!mesh.isMesh || mesh.userData.category !== 'Buildings' || mesh.userData.skirt) return;
    const position = mesh.geometry.getAttribute('position');
    const normal = mesh.geometry.getAttribute('normal');
    const index = mesh.geometry.index;
    if (!position || !normal) return;
    const triCount = (index ? index.count : position.count) / 3;
    for (let t = 0; t < triCount; t++) {
      const ids = [0, 1, 2].map(k => index ? index.getX(t * 3 + k) : t * 3 + k);
      if ((normal.getY(ids[0]) + normal.getY(ids[1]) + normal.getY(ids[2])) / 3 < 0.55) continue;
      for (const i of ids) xyz.push(position.getX(i), position.getY(i) + 0.15, position.getZ(i), 0.5 + position.getX(i) / width, 0.5 - position.getZ(i) / width);
    }
  });
  if (!xyz.length) return;
  const zoom = cell.z + 3;
  const tiles = 2 ** (zoom - cell.z);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = tiles * 256;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const geometry = new THREE.BufferGeometry();
  const position = new Float32Array(xyz.length / 5 * 3);
  const uv = new Float32Array(xyz.length / 5 * 2);
  for (let i = 0, v = 0; i < xyz.length; i += 5, v++) {
    position.set(xyz.slice(i, i + 3), v * 3);
    uv.set(xyz.slice(i + 3, i + 5), v * 2);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const drape = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map: texture, emissiveMap: texture, emissive: '#ffffff', emissiveIntensity: 0.42,
    color: '#ffffff', roughness: 1, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -30, polygonOffsetUnits: -30, depthWrite: false,
  }));
  drape.name = 'Drape';
  drape.castShadow = false;
  drape.receiveShadow = true;
  drape.visible = false;
  group.add(drape);
  let pending = tiles * tiles;
  const done = () => {
    if (--pending !== 0) return;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * 1.55);
      data[i + 1] = Math.min(255, data[i + 1] * 1.55);
      data[i + 2] = Math.min(255, data[i + 2] * 1.55);
    }
    ctx.putImageData(pixels, 0, 0);
    texture.needsUpdate = true;
    drape.visible = true;
  };
  for (let row = 0; row < tiles; row++) {
    for (let col = 0; col < tiles; col++) {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => { ctx.drawImage(image, col * 256, row * 256); done(); };
      image.onerror = done;
      image.src = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + zoom + '/' + (cell.y * tiles + row) + '/' + (cell.x * tiles + col);
    }
  }
}
function span(cell) {
  const n = 2 ** cell.z;
  const latitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * (cell.y + 0.5) / n)));
  return (2 * Math.PI * R / n) * Math.cos(latitude);
}
function overlaps(a, b) {
  return a.west < b.east && b.west < a.east && a.south < b.north && b.south < a.north;
}
function wanted() {
  const here = controls.target;
  const tile = (2 * Math.PI * R / 2 ** zoom) * scale;
  const radius = Math.max(tile * 1.2, camera.position.distanceTo(here) * 1.4);
  const near = cells.filter(cell => cell.z === zoom && place((cell.south + cell.north) / 2, (cell.west + cell.east) / 2).distanceTo(here) < radius);
  near.sort((a, b) => {
    const da = place((a.south + a.north) / 2, (a.west + a.east) / 2).distanceTo(here);
    const db = place((b.south + b.north) / 2, (b.west + b.east) / 2).distanceTo(here);
    return da - db || b.z - a.z;
  });
  const chosen = [];
  for (const cell of near) {
    if (chosen.some(other => other.z > cell.z && overlaps(other, cell))) continue;
    chosen.push(cell);
    if (chosen.length >= (mode === 'glb' ? 16 : 64)) break;
  }
  return chosen;
}
function drop(group) {
  group.traverse(node => {
    if (node.geometry) node.geometry.dispose();
    if (node.material) {
      const materials = [].concat(node.material);
      for (const material of materials) {
        if (material.map) material.map.dispose();
        material.dispose();
      }
    }
  });
  world.remove(group);
}
async function show(cell) {
  const key = cell.tile + ':' + mode;
  if (placed.has(key)) return;
  const group = new THREE.Group();
  group.position.copy(place((cell.south + cell.north) / 2, (cell.west + cell.east) / 2));
  placed.set(key, group);
  world.add(group);
  if (mode === 'photo') {
    const width = span(cell);
    const texture = await textureLoader.loadAsync(cell.photo + '?t=' + cell.tile);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, width),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    mesh.rotation.x = -Math.PI / 2;
    group.add(mesh);
    return;
  }
  for (const url of [cell.terrain, cell.buildings]) {
    if (!url) continue;
    const gltf = await loader.loadAsync(url);
    restoreLayers(gltf.scene);
    group.add(gltf.scene);
  }
  dressRoofs(group, cell);
}
async function sync() {
  const keep = new Set(wanted().map(cell => cell.tile + ':' + mode));
  for (const [key, group] of placed) {
    if (!keep.has(key)) {
      drop(group);
      placed.delete(key);
    }
  }
  const list = wanted();
  document.getElementById('caption').textContent = list.length ? list[0].tile : 'sin baldosa';
  note.textContent = 'Irún · sol 16:00 · tejados con satélite. ' + (mode === 'glb' ? 'GLB' : 'Foto') + '. ' + list.length + ' celdas. Arrastra, rueda, botón derecho.';
  for (const cell of list) {
    try { await show(cell); }
    catch (error) { note.textContent = cell.tile + ' · ' + error; }
  }
}
function setMode(next) {
  mode = next;
  document.getElementById('mode-glb').classList.toggle('on', next === 'glb');
  document.getElementById('mode-photo').classList.toggle('on', next === 'photo');
  for (const [key, group] of placed) {
    drop(group);
    placed.delete(key);
  }
  sync();
}
function setZoom(next) {
  zoom = next;
  for (const level of [13, 14, 15]) document.getElementById('zoom-' + level).classList.toggle('on', level === next);
  for (const [key, group] of placed) {
    drop(group);
    placed.delete(key);
  }
  sync();
}
document.getElementById('zoom-13').onclick = () => setZoom(13);
document.getElementById('zoom-14').onclick = () => setZoom(14);
document.getElementById('zoom-15').onclick = () => setZoom(15);
document.getElementById('mode-glb').onclick = () => setMode('glb');
document.getElementById('mode-photo').onclick = () => setMode('photo');
function resize() {
  const width = canvas.clientWidth, height = canvas.clientHeight;
  if (canvas.width !== Math.floor(width * renderer.getPixelRatio()) || canvas.height !== Math.floor(height * renderer.getPixelRatio())) {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }
}
const query = new URLSearchParams(location.search);
const asked = (query.get('tile') || '').match(/^z\/(1[345])\/(\d+)\/(\d+)$/);
const qz = Number(query.get('z') || (asked && asked[1]));
const qx = Number(query.get('x') || (asked && asked[2]));
const qy = Number(query.get('y') || (asked && asked[3]));
if (Number.isInteger(qz) && Number.isInteger(qx) && Number.isInteger(qy) && qx < 2 ** qz && qy < 2 ** qz) {
  const n = 2 ** qz;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (qy + 0.5) / n))) * 180 / Math.PI;
  const lon = (qx + 0.5) / n * 360 - 180;
  const at = place(lat, lon);
  controls.target.copy(at);
  camera.position.copy(at).add(new THREE.Vector3(380, 160, 380));
  zoom = qz;
  for (const level of [13, 14, 15]) document.getElementById('zoom-' + level).classList.toggle('on', level === qz);
}
controls.addEventListener('end', () => sync());
async function refresh() {
  const data = await fetch('/status.json').then(r => r.json()).catch(() => null);
  if (!data) return;
  cells = (data.cells || []).filter(cell => cell.terrain || cell.photo);
  sync();
}
refresh();
setInterval(refresh, 8000);
document.getElementById('hour').oninput = (event) => {
  hour = Number(event.target.value);
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  document.getElementById('hour-label').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  aimSun();
};
aimSun();
renderer.setAnimationLoop(() => { resize(); controls.update(); aimSun(); renderer.render(scene, camera); });
</script>
</body>
</html>
'''
