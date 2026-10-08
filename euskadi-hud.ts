/**
 * Euskadi Online in-game HUD chrome (host-only).
 *
 * Top-left: persistent brand text exactly `EUSKADI.ONLINE` (uppercase, 80% of the former size, 2026-10-09) (boot display face), shown from first
 * paint in the same place through the black splash, attract and game (it is the only brand; the
 * splash wordmark is hidden in euskadi-boot.ts), with a status / tip line underneath (game only). Hides the stock top speed/gear/lat panel
 * and the engine `.nabla-game-hud` (in-car cluster still shows speed).
 *
 * Bottom-left block (2026-10-06): game clock HH:MM + a small «Hora real» icon button, ABOVE the
 * city (large) and street (small). Order left→right: reserved accelerator slot, this block, then
 * the touch action buttons. Layout is fixed, so entering/exiting a vehicle never moves it.
 *   - Clock: current sim time from the runtime's `skyClock` (engine planet/sky API), 4×/s. The
 *     runtime handle is `window.euskadiRuntime` (set by vite.euskadi.config.ts).
 *   - Button: `setSkyClock(liveSkyClock(1))`: real current time, speed ×1 (Planeta → Hora
 *     «Ahora» keeps the current speed; this one forces ×1).
 *   - Mouse wheel over the clock: ±1 hour (wheel up = later), wraps midnight, keeps the speed
 *     (×24 keeps running; at ×1 the engine can only hold a fixed hour, like the menu does).
 *   - The local engine (euskadi engine patches, touch-driving.ts) renders the accelerator slot,
 *     its `.touch-driving-place` city/street block and the icon buttons. When that block exists
 *     the clock row moves above its city label and the host block is removed (no duplicate
 *     city). The engine's «Localidad sin datos» filler is hidden (slot kept). Without the engine
 *     block (stock engine) the host draws the same block itself and reserves the slots.
 *   - City/street come from the engine's navigation-places module (same instance the runtime
 *     fills), imported through the dev server.
 *
 * Does not touch demo-config.ts (spawn/fleet/tiles). City labels in 3D are off via
 * NABLA_BOOT.cityLabels:false + layers=-places (nabla-engine #122).
 */

const FONT = '"Pricedown", "Impact", "Arial Black", "Helvetica Neue", Arial, sans-serif'

/** Spanish tips shown under the brand when the engine has no live status message. */
export const EUSKADI_TIPS = [
  'Consejo: W A S D para conducir · Espacio frena',
  'Consejo: C cambia la cámara · E entrar o salir',
  'Consejo: H luces · G GPS · J menú del vehículo',
  'Consejo: Arrastra el acelerador a la izquierda para gas y freno',
  'Consejo: El volante gira con el dedo o el ratón',
  'Consejo: F9 diagnósticos de rueda · Tab arma',
  'Consejo: Explora las carreteras del País Vasco',
] as const

/** Host CSS: brand + status top-left; hide stock telemetry that used to sit there. */
export const EUSKADI_HUD_CSS = [
  `#euskadi-brand { position: fixed; top: clamp(12px, 2.2vh, 28px); left: clamp(12px, 2vw, 28px);`,
  ` z-index: 40; pointer-events: none; color: #fff; font-family: ${FONT}; font-weight: 900;`,
  ` font-size: clamp(14.4px, 2.08vw, 22.4px); letter-spacing: 0.04em; line-height: 1;`,
  ` text-shadow: 0 2px 8px rgba(0,0,0,.75); }`,
  `#euskadi-status { position: fixed; top: calc(clamp(12px, 2.2vh, 28px) + clamp(22px, 3.2vw, 34px));`,
  ` left: clamp(12px, 2vw, 28px); z-index: 40; pointer-events: none; max-width: min(420px, 70vw);`,
  ` color: rgba(255,255,255,.92); font: 13px/1.35 system-ui, sans-serif;`,
  ` text-shadow: 0 1px 4px rgba(0,0,0,.8); }`,
  `#game-hud { background: transparent !important; padding: 0 !important; gap: 0 !important;`,
  ` top: 0 !important; left: 0 !important; box-shadow: none !important; border: none !important; }`,
  `#game-hud > :is(#speed-display, #gear-display, #location-display, #cells-display, #game-message) {`,
  ` display: none !important; }`,
  `.nabla-game-hud { display: none !important; }`,
  // Brand: same spot from first paint through splash/attract to game. While the splash is up it
  // sits above the black curtain (999) and #loading-screen (1000), below #error-message (2000).
  `body:has(#loading-screen:not(.hidden)) #euskadi-brand { z-index: 1002; }`,
  `body:has(#loading-screen:not(.hidden)) #euskadi-status { opacity: 0; }`,
  `body:has(#loading-screen.hidden) #euskadi-status { opacity: 1; transition: opacity .6s ease; }`,
].join('')

/** Bottom-left block: accelerator slot (8px inset + 56px stack + gap) then this, then buttons. */
const PLACE_LEFT = 'calc(8px + 56px + 12px)'
const PLACE_WIDTH = 'clamp(150px, 16vw, 210px)'

export const EUSKADI_PLACE_CSS = [
  `:root { --euskadi-place-w: ${PLACE_WIDTH}; }`,
  `#euskadi-place { position: fixed; left: ${PLACE_LEFT}; bottom: 16px; z-index: 46;`,
  ` width: var(--euskadi-place-w); pointer-events: none; color: #fff;`,
  ` text-shadow: 0 1px 4px rgba(0,0,0,.85); font-family: system-ui, sans-serif; }`,
  `.euskadi-clock-row { display: flex; align-items: center; gap: 6px; height: 28px;`,
  ` margin: 0 0 2px; pointer-events: auto; width: max-content; cursor: ns-resize; user-select: none;`,
  ` color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,.85); }`,
  `.euskadi-clock-row[data-ready="0"] { visibility: hidden; }`,
  `.euskadi-clock { font-family: ${FONT}; font-weight: 900; font-size: 22px; line-height: 1;`,
  ` letter-spacing: .03em; font-variant-numeric: tabular-nums; min-width: 3.1em; }`,
  `.euskadi-clock-row[data-mode="fixed"] .euskadi-clock { opacity: .78; }`,
  `.euskadi-clock-real { display: inline-flex; align-items: center; justify-content: center;`,
  ` width: 26px; height: 26px; padding: 0; border-radius: 50%; cursor: pointer; color: #fff;`,
  ` background: #111827cc; border: 1px solid #66758d; touch-action: manipulation; }`,
  `.euskadi-clock-real:hover { background: #1f2937ee; }`,
  `.euskadi-clock-real.is-on { background: #2563eb; border-color: #93c5fd; }`,
  `.euskadi-clock-real svg { display: block; }`,
  `.euskadi-city { font-size: clamp(18px, 2.4vw, 26px); font-weight: 700; line-height: 1.15;`,
  ` height: 1.15em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`,
  `.euskadi-street { font-size: 13px; line-height: 16px; height: 16px; opacity: .9; margin-top: 2px;`,
  ` white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`,
  // Stock touch rig (no engine place block): keep the accelerator and wheel slots reserved on foot
  // and put the buttons right after this block, so entering/exiting a vehicle never moves anything.
  `body.euskadi-place-host .touch-driving:not(.is-driving) .touch-driving-stack {`,
  ` display: flex !important; visibility: hidden; pointer-events: none !important; }`,
  `body.euskadi-place-host .touch-driving:not(.is-driving) .touch-driving-wheel {`,
  ` display: block !important; visibility: hidden; pointer-events: none !important; }`,
  `body.euskadi-place-host .touch-driving-bar { justify-content: flex-start;`,
  ` margin-left: calc(12px + var(--euskadi-place-w) + 12px); margin-right: auto; }`,
  // Local engine place block (touch-driving.ts): clock row on top of its city label.
  // Fixed size so long/short or missing city/street never moves the clock or the buttons.
  `.touch-driving-place { flex: none; width: var(--euskadi-place-w); min-width: 0; max-width: none; }`,
  `.touch-driving-place .euskadi-clock-row { margin-bottom: 4px; }`,
  `.touch-driving-place .touch-driving-city { height: 1.15em; white-space: nowrap; overflow: hidden;`,
  ` text-overflow: ellipsis; }`,
  `.touch-driving-place .touch-driving-street { display: block !important; height: 16px;`,
  ` line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }`,
  `.touch-driving-place .touch-driving-street[hidden] { visibility: hidden; }`,
  `.touch-driving-city.euskadi-nodata { visibility: hidden; }`,
  `body:has(#loading-screen:not(.hidden)) :is(#euskadi-place, .euskadi-clock-row) { opacity: 0; }`,
  `body:has(#loading-screen.hidden) :is(#euskadi-place, .euskadi-clock-row) { opacity: 1;`,
  ` transition: opacity .6s ease; }`,
].join('')

/**
 * Brand node written straight into <body> by vite.euskadi.config.ts, so `euskadi.online` is on
 * screen top-left from first paint (the head script would only add it at DOMContentLoaded, which
 * in dev waits for the whole main.ts module graph).
 */
export const EUSKADI_BRAND_HTML = '<div id="euskadi-brand">EUSKADI.ONLINE</div>'

/**
 * Browser module (dev server): clock + «Hora real» button + wheel, and city/street for the host
 * block. `__NAV_URL__` becomes the dev-server URL of the engine's navigation-places module (the
 * same module instance the runtime fills). No backticks, `${` or backslashes inside on purpose.
 */
const CLOCK_MODULE = String.raw`import { formatClockTime, liveSkyClock, localMinutes, skyClockAtMinutes, skyClockAtRate, skyRate, skyTime } from '@nabla/engine/planet/sky';
import * as navigationPlaces from '__NAV_URL__';
const ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 3.5V8h4.5"/><path d="M12 7.5V12l3 2"/></svg>';
const WHEEL_STEP = 40;
// Static import with the exact URL the runtime's own modules use, so this is the same module
// instance the runtime fills (a dynamic import gets Vite's ?import query = an empty copy).
const nav = navigationPlaces;
const runtime = () => {
  const r = window.euskadiRuntime || window.nablaRuntime;
  return r && r.skyClock && typeof r.setSkyClock === 'function' ? r : null;
};
const node = (tag, cls) => { const el = document.createElement(tag); if (cls) el.className = cls; return el; };
const block = node('div', 'euskadi-place');
block.id = 'euskadi-place';
const row = node('div', 'euskadi-clock-row');
const clock = node('span', 'euskadi-clock');
clock.textContent = '--:--';
const real = node('button', 'euskadi-clock-real');
real.type = 'button';
real.innerHTML = ICON;
real.setAttribute('aria-label', 'Hora real');
real.title = 'Hora real: sincroniza con el reloj actual (velocidad ×1)';
real.setAttribute('aria-pressed', 'false');
row.append(clock, real);
row.title = 'Hora del juego · rueda del ratón: ±1 hora';
const city = node('div', 'euskadi-city');
const street = node('div', 'euskadi-street');
block.append(row, city, street);
const showClock = () => {
  const r = runtime();
  if (!r) { block.dataset.ready = '0'; row.dataset.ready = '0'; return; }
  block.dataset.ready = '1'; row.dataset.ready = '1';
  const sky = r.skyClock;
  const rate = skyRate(sky);
  const text = formatClockTime(localMinutes(skyTime(sky)));
  if (clock.textContent !== text) clock.textContent = text;
  const isReal = sky.mode === 'live' && rate === 1;
  const mode = isReal ? 'real' : sky.mode === 'live' ? 'running' : 'fixed';
  if (row.dataset.mode !== mode || row.dataset.rate !== String(rate)) {
    row.dataset.mode = mode;
    row.dataset.rate = String(rate);
    real.classList.toggle('is-on', isReal);
    real.setAttribute('aria-pressed', String(isReal));
    clock.title = isReal ? 'Hora real (×1), sigue al reloj · rueda: ±1 hora'
      : mode === 'running' ? 'Hora del juego ×' + rate + ' · rueda: ±1 hora'
      : 'Hora fija · rueda: ±1 hora · botón: hora real';
  }
};
const showPlace = () => {
  if (row.parentElement !== block) return; // engine block owns city/street
  const r = runtime();
  const p = r && r.session && r.session.simulation && r.session.simulation.player ? r.session.simulation.player.position : null;
  let c = '', s = '';
  if (nav && p) {
    try {
      c = String(nav.nearestLocality(p) || '').replace(/^Cerca de /, '');
      if (c === 'Localidad sin datos') c = '';
      s = nav.nearestStreet(p) || '';
    } catch { /* keep blank */ }
  }
  if (city.textContent !== c) city.textContent = c;
  if (street.textContent !== s) street.textContent = s;
};
/** When the local engine renders its own place block (city + street), put the clock above its city. */
const placeHome = () => {
  const engine = document.querySelector('.touch-driving-place');
  if (engine) {
    // Engine city label with no OSM places in the tile manifests: keep its slot, hide the filler.
    const engineCity = engine.querySelector('.touch-driving-city');
    if (engineCity) engineCity.classList.toggle('euskadi-nodata', engineCity.textContent === 'Localidad sin datos');
    if (row.parentElement !== engine) engine.prepend(row);
    if (block.isConnected) block.remove();
    document.body.classList.remove('euskadi-place-host');
  } else {
    if (row.parentElement !== block) block.prepend(row);
    if (!block.isConnected) document.body.append(block);
    document.body.classList.add('euskadi-place-host');
  }
};
real.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
real.addEventListener('click', (e) => {
  e.preventDefault(); e.stopPropagation();
  const r = runtime();
  if (!r) return;
  r.setSkyClock(liveSkyClock(1));
  real.blur();
  showClock();
});
let wheelAcc = 0;
row.addEventListener('wheel', (e) => {
  e.preventDefault(); e.stopPropagation();
  const r = runtime();
  if (!r) return;
  const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 400 : 1;
  const delta = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * unit;
  if (Math.sign(delta) !== Math.sign(wheelAcc)) wheelAcc = 0;
  wheelAcc += delta;
  if (Math.abs(wheelAcc) < WHEEL_STEP) return;
  const hours = wheelAcc < 0 ? 1 : -1; // wheel up = later
  wheelAcc = 0;
  const sky = r.skyClock;
  const rate = skyRate(sky);
  const minutes = (((localMinutes(skyTime(sky)) + hours * 60) % 1440) + 1440) % 1440;
  const next = skyClockAtMinutes(sky, minutes);
  r.setSkyClock(rate === 1 ? next : skyClockAtRate(next, rate));
  showClock();
}, { passive: false });
const start = () => {
  placeHome(); showClock(); showPlace();
  setInterval(() => { placeHome(); showClock(); }, 250);
  setInterval(showPlace, 500);
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
`

/** URL the dev server uses for engine dist modules (`/@fs<engine root>/dist/...`). */
function navigationPlacesUrl(engineRoot: string): string {
  const root = engineRoot.split('\\').join('/').replace(/\/$/, '')
  return `/@fs${root}/dist/render/entity/navigation-places.js`
}

/**
 * Head snippet: HUD CSS + brand/status nodes + tip rotator that yields to engine messages
 * and cell-loading text mirrored from the (hidden) stock HUD nodes. Plus the bottom-left
 * clock/place module (inline module script; Vite resolves its imports in dev).
 */
export function euskadiHudHead(engineRoot: string = process.cwd()): string {
  const css = (EUSKADI_HUD_CSS + EUSKADI_PLACE_CSS).replace(/<\//g, '<\\/')
  const clock = CLOCK_MODULE.replace('__NAV_URL__', navigationPlacesUrl(engineRoot)).replace(
    /<\//g,
    '<\\/',
  )
  const tips = JSON.stringify([...EUSKADI_TIPS]).replace(/</g, '\\u003c')
  return (
    `<style data-euskadi-hud>${css}</style>` +
    `<script data-euskadi-hud>(() => {` +
    `const TIPS = ${tips};` +
    `let tip = 0, tipAt = 0, lastCells = '';` +
    `const ensure = () => {` +
    `  let brand = document.getElementById('euskadi-brand');` +
    `  if (!brand) { brand = document.createElement('div'); brand.id = 'euskadi-brand'; brand.textContent = 'EUSKADI.ONLINE'; document.body.append(brand); }` +
    `  else if (brand.textContent !== 'EUSKADI.ONLINE') brand.textContent = 'EUSKADI.ONLINE';` +
    `  let status = document.getElementById('euskadi-status');` +
    `  if (!status) { status = document.createElement('div'); status.id = 'euskadi-status'; status.setAttribute('role', 'status'); document.body.append(status); }` +
    `  return status;` +
    `};` +
    `const tick = () => {` +
    `  const status = ensure();` +
    `  const msg = (document.getElementById('game-message')?.textContent || '').trim();` +
    `  const cells = (document.getElementById('cells-display')?.textContent || '').trim();` +
    `  const now = Date.now();` +
    `  let next = '';` +
    `  if (msg) next = msg;` +
    `  else if (cells && cells !== lastCells) { next = cells; lastCells = cells; tipAt = now; }` +
    `  else if (cells && now - tipAt < 4000) next = cells;` +
    `  else { if (now - tipAt > 8000) { tip = (tip + 1) % TIPS.length; tipAt = now; } next = TIPS[tip] || ''; }` +
    `  if (status.textContent !== next) status.textContent = next;` +
    `};` +
    `const start = () => { ensure(); tick(); setInterval(tick, 500); };` +
    `if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);` +
    `else start();` +
    `})();</script>` +
    `<script type="module" data-euskadi-hud-clock>${clock}</script>`
  )
}
