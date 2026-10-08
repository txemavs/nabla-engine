/**
 * Euskadi Online boot splash (nabla-engine #111 `window.NABLA_BOOT`, wired via vite.euskadi.config.ts).
 *
 * API: engine docs/boot-and-splash.md and game/boot.ts (main).
 * The engine's game/boot.ts reads `window.NABLA_BOOT` (set before main.ts), then
 * `VITE_NABLA_BOOT` JSON, then URL `?boot=attract|classic`, `?probe=0`.
 *
 * Two phases (2026-10-06 redesign):
 *   1. Before the planet: black screen, the Nabla mark (hollow ice-blue triangle, tip down)
 *      small in the bottom-right corner. No loading text.
 *   2. Attract (planet from orbit) as before.
 * In both phases (and in game) the only brand is `euskadi.online` at the TOP-LEFT, exactly where
 * the in-game HUD has it (euskadi-hud.ts #euskadi-brand, above the curtain while loading). The
 * splash wordmark (#loading-logo, EUSKADI_LOGO_URL) is hidden: it must never show at the bottom.
 *
 * The engine has no pre-attract phase and still writes its own loading lines
 * («Cargando el motor…», «Cargando el terreno…», describeLoading cells/requests), shows the
 * "NABLA ENGINE" h1 from game/index.html, and falls back to its default messages when
 * `messages` is empty. So phase 1 and the silence are done with host CSS that
 * vite.euskadi.config.ts puts in <head> (first paint, before main.ts):
 *   - body::before is a black curtain (under #loading-screen, over canvas/menu/HUD);
 *   - opening credits (EUSKADI_CREDITS below) play over the curtain and then over the scene,
 *     in parallel with loading; they replaced the bottom-right Nabla mark (2026-10-06);
 *   - both fade out once the canvas gets `data-boot-mode` (attract starts, or play), or the
 *     splash hides (classic mode);
 *   - status / detail / progress / tile grid / title are never shown. Fatal start errors still
 *     show: #error-message (z-index 2000) is outside the splash and above the curtain.
 *
 * Brand/copy only. Nothing here touches demo-config.ts (tiles, spawn, fleet).
 */

/** Same wordmark as brand/euskadi-online.svg (kept inline so one read-only mount is enough). */
export const EUSKADI_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 232" role="img" aria-label="Euskadi Online">
  <title>Euskadi Online</title>
  <!-- Wordmark from the original euskadi.online "Coming Soon" cover (index.html/style.css @ 7e18262):
       white, heavy display face, EUSKADI tight (.04em) over ONLINE at .45x with .5em tracking.
       Left-aligned for the bottom-left attract splash. -->
  <g fill="#fff" font-family="Pricedown, Impact, 'Arial Black', 'Helvetica Neue', Arial, sans-serif" font-weight="900">
    <text x="2" y="142" font-size="150" letter-spacing="6" textLength="632" lengthAdjust="spacingAndGlyphs">EUSKADI</text>
    <text x="6" y="218" font-size="67" letter-spacing="34" textLength="560" lengthAdjust="spacing">ONLINE</text>
  </g>
</svg>`

export const EUSKADI_LOGO_URL = 'data:image/svg+xml,' + encodeURIComponent(EUSKADI_LOGO_SVG)

/**
 * Nabla mark: hollow ice-blue triangle, tip DOWN (∇). Same artwork as brand/nabla-mark.svg,
 * which is nabla-engine assets/brand/source.svg (the engine's own favicon mark), cropped to the
 * triangle so it sits flush in the corner.
 */
export const NABLA_MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="16 46 148 130" role="img" aria-label="Nabla"><defs><linearGradient id="skyTop" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#D9F5FF"/><stop offset=".382" stop-color="#81B5D8"/><stop offset="1" stop-color="#245580"/></linearGradient><linearGradient id="skyRight" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#244F7B"/><stop offset=".618" stop-color="#609BBF"/><stop offset="1" stop-color="#DFFAFF"/></linearGradient><linearGradient id="skyLeft" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ECFCFF"/><stop offset=".382" stop-color="#6498BA"/><stop offset="1" stop-color="#C7EDF4"/></linearGradient></defs><polygon fill="#E8FAFF" points="18.00000,48.43078 162.00000,48.43078 157.68000,50.92493 22.32000,50.92493"/><polygon fill="#719AB8" points="162.00000,48.43078 90.00000,173.13844 90.00000,168.15013 157.68000,50.92493"/><polygon fill="#C6E9F8" points="90.00000,173.13844 18.00000,48.43078 22.32000,50.92493 90.00000,168.15013"/><polygon fill="url(#skyTop)" points="22.32000,50.92493 157.68000,50.92493 141.84000,60.07016 38.16000,60.07016"/><polygon fill="url(#skyRight)" points="157.68000,50.92493 90.00000,168.15013 90.00000,149.85968 141.84000,60.07016"/><polygon fill="url(#skyLeft)" points="90.00000,168.15013 22.32000,50.92493 38.16000,60.07016 90.00000,149.85968"/><polygon fill="#274D70" points="38.16000,60.07016 141.84000,60.07016 137.52000,62.56431 42.48000,62.56431"/><polygon fill="#D2EDF4" points="141.84000,60.07016 90.00000,149.85968 90.00000,144.87137 137.52000,62.56431"/><polygon fill="#84B5D2" points="90.00000,149.85968 38.16000,60.07016 42.48000,62.56431 90.00000,144.87137"/></svg>`

export const NABLA_MARK_URL = 'data:image/svg+xml,' + encodeURIComponent(NABLA_MARK_SVG)

const FONT = '"Pricedown", "Impact", "Arial Black", "Helvetica Neue", Arial, sans-serif'

/** When attract has started (or play, or the splash is gone): phase 2. */
const PHASE2 = [
  `body:has(#game-canvas[data-boot-mode])`,
  `body:has(#loading-screen.hidden)`,
]
const phase2 = (suffix: string) => PHASE2.map((s) => s + suffix).join(',')

/** Fade timing: hold the black a moment after attract starts so the globe is not a flash. */
const FADE = 'opacity 1.2s ease .8s'

/** Host CSS for both phases. Goes in <head> before main.ts (see vite.euskadi.config.ts). */
export const EUSKADI_SPLASH_CSS = [
  `html, body { background: #000; }`,
  // Phase 1: black curtain over canvas/menu/HUD (below #loading-screen 1000, #error-message 2000).
  `body::before { content: ""; position: fixed; inset: 0; background: #000; z-index: 999;`,
  ` pointer-events: none; transition: ${FADE}; }`,
  // Phase 1: the Nabla mark (bottom-right) is replaced by the opening credits («NABLA PRODUCTIONS»).
  `${phase2('::before')} { opacity: 0; }`,
  // Splash box: never a card or a background; no text, bar or tile grid in either phase.
  `#loading-screen { --splash-bg: transparent; --splash-fg: #fff; --splash-logo-height: 160px;`,
  ` background: transparent !important; font-family: ${FONT}; pointer-events: none; }`,
  `#loading-screen :is(#loading-status, #loading-detail, #loading-progress, #loading-tiles) { display: none !important; }`,
  `#loading-screen #loading-title { position: absolute; width: 1px; height: 1px; overflow: hidden;`,
  ` clip: rect(0 0 0 0); white-space: nowrap; }`,
  // No splash wordmark at all (2026-10-06): the brand is the in-game top-left `euskadi.online`
  // (euskadi-hud.ts #euskadi-brand), shown from first paint above the curtain, so it sits in the
  // same place through black splash, attract and game and never moves or appears at the bottom.
  `#loading-screen.splash-corner { inset: auto auto clamp(20px, 5vh, 56px) clamp(20px, 4vw, 56px);`,
  ` padding: 0; gap: 0; border-radius: 0; max-width: min(640px, calc(100vw - 40px)); }`,
  `#loading-screen #loading-logo { display: none !important; }`,
].join('')

/**
 * Opening credits (film style), played in parallel with loading: they never wait for or block
 * the game. `on` is the moment a card is queued:
 *   - `boot`: first paint (black curtain);
 *   - `planet-ready`: the planet is on screen (attract starts, canvas `data-boot-mode`);
 *   - `play`: gameplay frames start;
 *   - `descent`: the start cameras leave the overhead view for the driver's seat
 *     (`data-camera-mode` map → cockpit while `data-start-cameras="active"`);
 *   - `engine-fired`: the engine has caught (start sound done, needles sweeping), still seated;
 *   - `engine-started`: the start-up (starter, needle sweep) has finished and we are seated;
 *   - `driving`: the start camera sequence has finished;
 *   - `reveal`: gameplay is revealed (canvas `data-reveal="play"`), the fade-in from above.
 *
 * Intro (item L, 2026-10-09): every card queued before `reveal` is the intro. The player holds
 * the engine's reveal (`runtime.holdReveal`) until those cards are gone, fades to black, lets
 * gameplay start under the black, then fades in while the camera descends from high above
 * (start camera `fromHeight`) with DIRECTED BY · Txema Vicente. Any key or tap skips the intro
 * (except a gesture that only unlocks the music, see the player).
 * Cards queue: each one shows `fadeMs` in, `holdMs`, `fadeMs` out (defaults 600 / 1000 / 600),
 * one at a time, in list order for the same trigger. Catch-up (`EUSKADI_CREDITS_OPTIONS`): when a
 * card of a LATER trigger is waiting, the current card is cut short (still at least `minVisibleMs`
 * on screen, fades of `catchUpFadeMs`) so every card shows close to its moment. Cards of the same
 * trigger (BIG DATA → PRODUCED BY) keep their full time.
 */
export type EuskadiCreditTrigger =
  | 'boot'
  | 'planet-ready'
  | 'play'
  | 'descent'
  | 'engine-fired'
  | 'engine-started'
  | 'driving'
  | 'reveal'

export interface EuskadiCredit {
  /**
   * Small role/label line on top, then the credit (big) below, e.g. ['DIRECTED BY', 'TXEMA VICENTE'].
   * A single line is shown big. Shown verbatim (no case changes).
   */
  lines: string[]
  on: EuskadiCreditTrigger
  holdMs?: number
  fadeMs?: number
  /** Per-card catch-up override (default `EUSKADI_CREDITS_OPTIONS.catchUp`). */
  catchUp?: boolean
  /** Per-card minimum on-screen time under catch-up, fades included. */
  minVisibleMs?: number
  /**
   * 'title': the opening wordmark (brand face, white): fades in while its wide letter-spacing
   * tightens over the fade-in and hold, then fades out moving up to reveal the planet.
   */
  style?: 'title'
}

export interface EuskadiCreditsOptions {
  /** Shorten a card when a later trigger's card is waiting (default true). */
  catchUp: boolean
  /** Minimum time a card stays on screen under catch-up, fades included (Euskadi 600). */
  minVisibleMs: number
  /** Fade in/out used while catching up (Euskadi 200). */
  catchUpFadeMs: number
  /** Hide the top-left brand during the credits; it fades in after the last card (default true). */
  hideBrand: boolean
  /** Pause between cards, ms (default 120; 40 while catching up). */
  gapMs: number
}

export const EUSKADI_CREDITS_OPTIONS: EuskadiCreditsOptions = {
  catchUp: false,
  minVisibleMs: 600,
  catchUpFadeMs: 200,
  hideBrand: true,
  gapMs: 120,
}

export const EUSKADI_CREDITS: EuskadiCredit[] = [
  // The title first, from black; the music starts as soon as it is on screen (or on the first
  // click/key).
  { lines: ['EUSKADI.ONLINE'], on: 'boot', holdMs: 1800, fadeMs: 1200, style: 'title' },
  // Credits block before the data attribution: Created by, Assistants. The music credit
  // ("Nimbus" by Eveningland) is in GAME.md, not on screen.
  { lines: ['CREATED BY', 'Grok Bot Art Team'], on: 'boot', holdMs: 1000, fadeMs: 600 },
  { lines: ['ASSISTANTS', 'GPT6 Astra'], on: 'boot', holdMs: 1000, fadeMs: 600 },
  // Map data: aerial photos and LiDAR (Basque Government) and OpenStreetMap (buildings), with
  // the attribution wording OSM requires.
  {
    lines: [
      'BIG DATA',
      'Aerial Photos and LiDAR',
      'Eusko Jaurlaritza / Gobierno Vasco',
      '© OpenStreetMap contributors',
    ],
    on: 'planet-ready',
    holdMs: 1000,
    fadeMs: 600,
  },
  { lines: ['PRODUCED BY', 'Nabla Studio'], on: 'planet-ready', holdMs: 1000, fadeMs: 600 },
  // After the fade to black, over the descent from high above (spelling: Txema).
  { lines: ['DIRECTED BY', 'Txema Vicente'], on: 'reveal', holdMs: 3600, fadeMs: 900 },
]

/**
 * Film credits in the brand face (same as the top-left `euskadi.online`): small letter-spaced
 * label on top, the credit big below, soft vignette so it reads over the scene.
 */
/**
 * Credits typeface: the regular members of the brand stack. Pricedown / Impact (the top-left
 * brand, weight 900) only exist in a heavy cut, so the credits use Helvetica Neue / Arial at
 * light/regular weight: no bold anywhere in the credits, bold stays for the brand only.
 */
const CREDIT_FONT = '"Helvetica Neue", Arial, sans-serif'

export const EUSKADI_CREDITS_CSS = [
  // Above the curtain (999), the splash (1000) and the brand (1002); below #error-message (2000).
  `#euskadi-credits { position: fixed; inset: 0; z-index: 1003; pointer-events: none;`,
  ` display: grid; place-items: center; }`,
  `.euskadi-credit { grid-area: 1 / 1; text-align: center; color: #fff; opacity: 0;`,
  ` font-family: ${CREDIT_FONT}; font-weight: 400; font-synthesis: none;`,
  ` padding: 6vh 10vw; transform: scale(1.02); filter: blur(5px);`,
  ` background: radial-gradient(closest-side, rgba(0,0,0,.45), rgba(0,0,0,0));`,
  ` text-shadow: 0 2px 14px rgba(0,0,0,.9);`,
  ` transition: opacity var(--fade) ease-in-out, filter var(--fade) ease-out,`,
  ` transform calc(var(--fade) * 3) cubic-bezier(.2,.6,.2,1); }`,
  `.euskadi-credit.is-on { opacity: 1; transform: none; filter: none; }`,
  `.euskadi-credit-label { font-weight: 400; font-size: clamp(11px, 1.15vw, 15px); line-height: 1.2;`,
  ` letter-spacing: .45em; margin-right: -.45em; opacity: .82; margin-bottom: 1.1em; }`,
  `.euskadi-credit-name { font-weight: 300; font-size: clamp(24px, 3.4vw, 48px); line-height: 1.12;`,
  ` letter-spacing: .14em; margin-right: -.14em; }`,
  // Top-left brand (and its tip line) hidden during the credits, fades in after the last card.
  `:is(#euskadi-brand, #euskadi-status) { transition: opacity 1.2s ease; }`,
  `html.euskadi-credits-on :is(#euskadi-brand, #euskadi-status) { opacity: 0 !important; }`,
  // Intro fade to black (under the credits, over the scene and HUD).
  `#euskadi-fade { position: fixed; inset: 0; z-index: 1001; background: #000; opacity: 0;`,
  ` pointer-events: none; transition: opacity var(--fade, 900ms) ease-in-out; }`,
  `#euskadi-fade.is-on { opacity: 1; }`,
  // Opening title: brand face, letter-spacing tightens from wide while it fades in and holds
  // (--track = fade-in + hold, set by the player), then it fades out in place. Keyframes, not
  // transitions: the title starts before first paint, where a transition has no start style.
  `@keyframes euskadi-title-in { from { opacity: 0; } to { opacity: 1; } }`,
  `@keyframes euskadi-title-out { from { opacity: 1; } to { opacity: 0; } }`,
  `@keyframes euskadi-title-track { from { letter-spacing: .45em; margin-right: -.45em; } to { letter-spacing: .04em; margin-right: -.04em; } }`,
  `.euskadi-credit.euskadi-title { background: none; filter: none; transform: none; transition: none;`,
  ` animation: euskadi-title-in var(--fade) ease-out both; }`,
  `.euskadi-credit.euskadi-title.is-out { animation: euskadi-title-out var(--fade) ease-in both; }`,
  `.euskadi-title .euskadi-credit-name { font-family: ${FONT}; font-weight: 900; font-size: clamp(34px, 6vw, 84px);`,
  ` animation: euskadi-title-track var(--track, 3s) cubic-bezier(.16,.7,.3,1) both; }`,
  `.euskadi-credit-name + .euskadi-credit-name { margin-top: .25em; font-size: clamp(20px, 2.7vw, 38px); }`,
].join('')

/**
 * Credits player (classic head script, runs at first paint). Reads `window.NABLA_BOOT.credits`,
 * watches the canvas dataset and the runtime (`window.euskadiRuntime`, vite.euskadi.config.ts),
 * and records `window.euskadiCreditsLog` ({ t ms, type, detail }) for headless checks.
 * Plain JS on purpose: no backticks, `${` or backslashes inside.
 */
const CREDITS_PLAYER = String.raw`(() => {
  const boot = window.NABLA_BOOT || {};
  const credits = (boot.credits || []).filter((c) => c && Array.isArray(c.lines) && c.lines.length);
  if (!credits.length) return;
  const opts = Object.assign({ catchUp: true, minVisibleMs: 500, catchUpFadeMs: 250, hideBrand: true, gapMs: 120 }, boot.creditsOptions || {});
  const html = document.documentElement;
  if (opts.hideBrand) html.classList.add('euskadi-credits-on');
  const t0 = performance.now();
  const now = () => performance.now() - t0;
  const log = (window.euskadiCreditsLog = []);
  const mark = (type, detail) => log.push({ t: Math.round(now()), type, detail });
  const root = document.createElement('div');
  root.id = 'euskadi-credits';
  root.setAttribute('aria-live', 'polite');
  const mount = () => { const host = document.body || html; if (root.parentNode !== host) host.append(root); };
  mount();
  const queue = [];
  const fired = new Map();
  let seq = 0;
  let played = 0;
  let current = null;
  let skippedIntro = false;
  let revealed = !opts.hideBrand;
  const reveal = (why) => { if (revealed) return; revealed = true; html.classList.remove('euskadi-credits-on'); mark('brand', why); };
  const catchUpOn = (item) => (item.catchUp == null ? opts.catchUp : item.catchUp) !== false;
  const laterWaiting = (s) => queue.some((q) => q.seq > s);
  // Loading stages (nabla-engine data-reveal-stage / -progress). The planet-ready cards (BIG
  // DATA, PRODUCED BY) each cover a share of the engine's loading; the last one holds until
  // the engine reports everything ready (data-reveal="holding"), so the descent never waits.
  const staged = credits.filter((c) => c.on === 'planet-ready');
  const stageReady = (item) => {
    const k = staged.indexOf(item);
    if (k < 0) return true;
    const canvas = document.getElementById('game-canvas');
    const d = canvas ? canvas.dataset : {};
    if (d.reveal === 'holding' || d.reveal === 'play') return true;
    // Before play() reports stages, hold only when the runtime can hold the reveal; an engine
    // without staged loading (data-reveal but no progress) never holds a card.
    if (d.revealProgress == null) return d.reveal != null || d.bootMode === 'play' || !held;
    if (k === staged.length - 1) return false;
    const ok = Number(d.revealProgress) >= (k + 1) / staged.length;
    if (!ok && !item.heldMarked) { item.heldMarked = true; mark('hold-card', item.lines[0] + ' @' + d.revealStage); }
    return ok;
  };
  const schedule = (cur) => {
    clearTimeout(cur.t1); clearTimeout(cur.t2);
    const wait = Math.max(0, cur.fadeOutAt - now());
    // The removal is armed only once the fade-out has started, so a busy main thread (tiles,
    // shaders) delays a card but never cuts its fade.
    cur.t1 = setTimeout(function fadeOut() {
      // Loading-staged: a card holds (past its normal time) until its loading stage is done.
      if (!stageReady(cur.item)) { cur.t1 = setTimeout(fadeOut, 100); return; }
      cur.fading = true;
      cur.card.style.setProperty('--fade', cur.fadeOut + 'ms');
      cur.card.classList.remove('is-on');
      if (cur.item.style === 'title') cur.card.classList.add('is-out');
      mark('fade', cur.title);
      cur.t2 = setTimeout(() => finish(cur), cur.fadeOut);
    }, wait);
  };
  const hurry = () => {
    const cur = current;
    if (!cur || !cur.painted || cur.fading || !catchUpOn(cur.item) || !laterWaiting(cur.seq)) return;
    const quick = Math.min(cur.fadeOut, opts.catchUpFadeMs);
    const minVisible = cur.item.minVisibleMs == null ? opts.minVisibleMs : cur.item.minVisibleMs;
    const at = Math.max(now(), cur.shownAt + Math.max(minVisible - quick, cur.fadeIn));
    if (at >= cur.fadeOutAt && quick >= cur.fadeOut) return;
    cur.fadeOutAt = Math.min(cur.fadeOutAt, at);
    cur.fadeOut = quick;
    mark('hurry', cur.title);
    schedule(cur);
  };
  const finish = (cur) => {
    cur.card.remove();
    current = null;
    played++;
    mark('gone', cur.title);
    if (played >= credits.length) reveal('after last card');
    setTimeout(next, queue.length && laterWaiting(cur.seq) ? 40 : opts.gapMs);
  };
  const next = () => {
    // Wait for <body>: moving the root there later would restart the title's CSS animation.
    if (!document.body) { setTimeout(next, 16); return; }
    mount();
    if (current || !queue.length) return;
    const entry = queue.shift();
    const item = entry.item;
    const fade = Math.max(0, Number(item.fadeMs == null ? 600 : item.fadeMs));
    const hold = Math.max(0, Number(item.holdMs == null ? 1000 : item.holdMs));
    const behind = catchUpOn(item) && laterWaiting(entry.seq);
    const fadeIn = behind ? Math.min(fade, opts.catchUpFadeMs) : fade;
    const card = document.createElement('div');
    card.className = item.style === 'title' ? 'euskadi-credit euskadi-title' : 'euskadi-credit';
    card.style.setProperty('--fade', fadeIn + 'ms');
    card.style.setProperty('--track', (fadeIn + hold) + 'ms');
    item.lines.forEach((text, i) => {
      const line = document.createElement('div');
      line.className = item.lines.length > 1 && i === 0 ? 'euskadi-credit-label' : 'euskadi-credit-name';
      line.textContent = String(text);
      card.append(line);
    });
    root.append(card);
    void card.offsetWidth;
    card.classList.add('is-on');
    const shownAt = now();
    current = { item, seq: entry.seq, card, title: item.lines[0], shownAt, fadeIn, fadeOut: fade, fadeOutAt: shownAt + fadeIn + hold, fading: false, painted: false };
    mark('show', current.title);
    schedule(current);
    // Catch-up counts the minimum time from the first painted frame: during the descent the main
    // thread can stall (cockpit shaders) and a card cut by the DOM clock would never be seen.
    const cur = current;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (current !== cur) return;
      cur.painted = true;
      cur.shownAt = now();
      if (cur.shownAt - shownAt > 50) mark('paint', cur.title + ' +' + Math.round(cur.shownAt - shownAt));
      hurry();
    }));
  };
  const trigger = (on) => {
    if (fired.has(on)) return;
    fired.set(on, now());
    mark('event', on);
    seq++;
    for (const c of credits) if (c.on === on && !(skippedIntro && on !== 'reveal')) queue.push({ item: c, seq });
    hurry();
    next();
  };
  let lastMode = '';
  let starting = false;
  const watch = () => {
    const canvas = document.getElementById('game-canvas');
    const d = canvas ? canvas.dataset : {};
    if (d.bootMode) trigger('planet-ready');
    if (d.bootMode === 'play') trigger('play');
    const mode = d.cameraMode || '';
    if (d.startCameras === 'active' && lastMode === 'map' && mode === 'cockpit') trigger('descent');
    if (d.startCameras === 'complete') trigger('driving');
    lastMode = mode;
    try {
      const r = window.euskadiRuntime || window.nablaRuntime;
      const sim = r && r.game && r.game.session ? r.game.session.simulation : null;
      const id = sim && sim.player ? sim.player.vehicleId : null;
      if (id) {
        const info = sim.vehicleInfo(id);
        if (info.helm !== 'off') {
          if (info.ignition === 'cranking') starting = true;
          if (info.ignition === 'sweep') { starting = true; trigger('engine-fired'); }
          if (info.ignition === 'running' && starting) { trigger('engine-fired'); trigger('engine-started'); }
        }
      }
    } catch (error) { /* runtime not ready */ }
    // Safety: a card whose trigger never fires (no start cameras, a skipped sequence) must not
    // keep the brand hidden: reveal once the game has been driving a while with nothing queued.
    if (!revealed && !current && !queue.length) {
      const drive = fired.get('driving');
      const play = fired.get('play');
      if ((drive != null && now() - drive > 4000) || (play != null && now() - play > 25000)) reveal('timeout');
    }
    if (revealed && credits.every((c) => fired.has(c.on))) clearInterval(timer);
  };
  // Intro (item L): hold the engine's reveal until the intro cards (all but 'reveal') are gone,
  // fade to black, and fade in again once gameplay is revealed.
  const intro = credits.filter((c) => c.on !== 'reveal').length;
  const fade = document.createElement('div');
  fade.id = 'euskadi-fade';
  const fadeTo = (on, ms) => { if (fade.parentNode !== root.parentNode) (document.body || html).append(fade); fade.style.setProperty('--fade', ms + 'ms'); void fade.offsetWidth; fade.classList.toggle('is-on', on); mark(on ? 'black' : 'unblack', ms); };
  let introDone;
  const introGate = new Promise((resolve) => { introDone = resolve; });
  let introOver = false;
  let revealing = false;
  const endIntro = (why, ms) => {
    if (introOver) return;
    introOver = true;
    mark('intro', why);
    fadeTo(true, ms);
    setTimeout(introDone, ms);
  };
  let held = false;
  let descentDone;
  const descentGate = new Promise((resolve) => { descentDone = resolve; });
  let music = false;
  const runtime = () => window.euskadiRuntime || window.nablaRuntime;
  const tryMusic = () => { const r = runtime(); if (!r || !r.startMusic) return; try { r.startMusic(); music = true; } catch (error) { /* disposed */ } };
  const watchIntro = () => {
    const r = runtime();
    if (r && r.holdReveal && !held) {
      held = true;
      try { r.holdReveal(introGate); mark('hold', 'reveal'); } catch (error) { introDone(); }
      // The descent from above waits at its start height until the fade-in has finished.
      try { if (r.holdStartCameras) { r.holdStartCameras(descentGate); mark('hold', 'descent'); } } catch (error) { descentDone(); }
    }
    if (!music && fired.has('boot') && log.some((e) => e.type === 'show')) tryMusic();
    if (!introOver && played >= intro && fired.has('planet-ready')) endIntro('credits done', 900);
    const canvas = document.getElementById('game-canvas');
    // data-reveal comes from nabla-engine #191; boot mode 'play' is the fallback for older engines.
    if (canvas && (canvas.dataset.reveal === 'play' || canvas.dataset.bootMode === 'play') && !revealing) {
      revealing = true;
      // Gameplay frames start under the black at 600 m. Fade in on the still aerial view with
      // DIRECTED BY, then release the descent once the picture is fully up.
      setTimeout(() => {
        trigger('reveal');
        fadeTo(false, 1600);
        setTimeout(() => { mark('descent', 'go'); descentDone(); }, 1700);
      }, 250);
    }
  };
  // Skip: any key or tap ends the intro cards at once. A gesture while the music is still
  // waiting for one (autoplay blocked) only starts the music and keeps the sequence going.
  const skip = (event) => {
    const r = runtime();
    if (r && r.startMusic && !r.musicPlaying) { tryMusic(); return; }
    if (introOver) return;
    mark('skip', event.type);
    skippedIntro = true;
    queue.splice(0).forEach((q) => { if (q.item.on === 'reveal') queue.push(q); });
    if (current) { clearTimeout(current.t1); clearTimeout(current.t2); current.card.remove(); current = null; }
    played = Math.max(played, intro);
    endIntro('skipped', 300);
  };
  window.addEventListener('keydown', skip, true);
  window.addEventListener('pointerdown', skip, true);
  const introTimer = setInterval(() => { watchIntro(); if (fired.has('reveal')) { clearInterval(introTimer); setTimeout(() => { window.removeEventListener('keydown', skip, true); window.removeEventListener('pointerdown', skip, true); }, 0); } }, 100);
  const timer = setInterval(watch, 100);
  trigger('boot');
})();`

export const EUSKADI_BOOT = {
  attract: true,
  /**
   * Black, mark-only pre-attract (nabla-engine #122): attract on and splash status text off.
   * The explicit `splash.layout` below still wins over the engine's 'mark' default, so the
   * host CSS keeps doing phase 1 (black + Nabla mark bottom-right) and phase 2 (wordmark
   * bottom-left over the planet).
   */
  preAttract: true,
  /** Floating OSM city names. Off for Euskadi Online (#122). */
  cityLabels: false,
  /** Default on; Ajustes → Capas → Cámara, or set false here / NABLA_BOOT. */
  flipCinematic: true,
  /** R reset on the nearest road/vía. Default on; Ajustes → Posición → Conducción. */
  recoverToRoad: true,
  /** Darker asphalt, whiter markings (engine default 1 = neutral). Ajustes → Capas → Asfalto. */
  asphaltContrast: 1,
  /**
   * Start cameras (nabla-engine startCameras): overhead, down into the driver's seat, the S3
   * starts up there (P, starter, needle sweep), then out to the third-person chase camera.
   * W/S/A/D or C skips. Omit for the engine default (driver view from the first frame).
   * 'chase' is the fixed third-person camera behind the car (follows its heading); the orbiting
   * one is 'cinematic' and stays user-selected (C).
   */
  startCameras: [
    // Fade in from above: 600 m (the engine's overhead maximum, config mapMaxHeight) settling
    // down to the driving height, then into the seat.
    // The engine holds it at 600 m until the fade-in is done, then it comes down; the next view
    // starts only once the camera is near the normal height (never cut short by slow frames).
    { view: 'overhead' as const, fromHeight: 600, after: 600 },
    { view: 'driver' as const, after: 800, transitionMs: 1800 },
    { view: 'chase' as const, after: 'engine' as const, transitionMs: 1400 },
  ],
  /**
   * Background music (nabla-engine GameRuntimeOptions.music): «Nimbus» by Eveningland, free to use
   * with credit. Opus first, AAC for Safari. Streamed, starts after the first click or key; volume
   * and mute in Ajustes → Opciones → Sonido. Files: music/ (served at /music/).
   */
  music: {
    sources: [
      { url: '/music/nimbus.ogg', type: 'audio/ogg; codecs=opus' },
      { url: '/music/nimbus.m4a', type: 'audio/mp4; codecs="mp4a.40.2"' },
    ],
  },
  /** Opening credits, in parallel with loading (see EUSKADI_CREDITS above). */
  credits: EUSKADI_CREDITS,
  creditsOptions: EUSKADI_CREDITS_OPTIONS,
  splash: {
    layout: 'corner' as const,
    title: 'Euskadi Online',
    // Empty on purpose. The engine still falls back to its own lines; CSS above hides them.
    messages: [] as string[],
    logoUrl: EUSKADI_LOGO_URL,
    themeCss: EUSKADI_SPLASH_CSS,
  },
}

/**
 * Inline <head> markup: the host splash CSS (first paint, before the engine's own markup is
 * visible) and the classic script setting window.NABLA_BOOT before the deferred module main.ts.
 */
export function euskadiBootScript(boot: object = EUSKADI_BOOT): string {
  const json = JSON.stringify(boot).replace(/</g, '\\u003c')
  const css = (EUSKADI_SPLASH_CSS + EUSKADI_CREDITS_CSS).replace(/<\//g, '<\\/')
  const player = CREDITS_PLAYER.replace(/<\//g, '<\\/')
  return (
    `<style data-euskadi-splash>${css}</style><script>window.NABLA_BOOT = ${json};</script>` +
    `<script data-euskadi-credits>${player}</script>`
  )
}