/** Entry point: the terrain chosen by the URL or the menu (flat tile, tile host, package folder). */
import { resolveEntry } from './entry.js'

const bootStatus = document.getElementById('loading-status')
const bootMark = performance.now()
/** Keep the HTML from saying «Initializing...» while modules and the entry probe run. */
if (bootStatus) bootStatus.textContent = 'Cargando el motor…'

const entry = await resolveEntry()
if (bootStatus)
  bootStatus.textContent =
    entry.mode === 'terrain' ? 'Cargando el terreno…' : 'Preparando la sesión…'
console.info(
  `[nabla-boot] entry ${entry.mode} after ${(performance.now() - bootMark).toFixed(0)}ms`,
)
// Show the address that is really played, so reloading or sharing it repeats this session.
if (entry.search !== location.search)
  history.replaceState(null, '', entry.search || location.pathname)
// Literal import() paths so Vite can pre-transform both graphs (ternary was opaque).
if (entry.mode === 'terrain') await import('./terrain-main.js')
else await import('./drive.js')
console.info(`[nabla-boot] host module ready after ${(performance.now() - bootMark).toFixed(0)}ms`)
