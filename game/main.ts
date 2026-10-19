/** Entry point: the terrain chosen by the URL or the menu (flat tile, tile host, package folder). */
import { applySplashSkin, splashMessageAt } from '@nabla/engine/runtime/splash'
import { readBootConfig } from './boot.js'
import { resolveEntry } from './entry.js'

const bootStatus = document.getElementById('loading-status')
const bootMark = performance.now()
// Apply the host skin before anything else, so a mark-only or quiet host never shows Nabla texts.
const hostSplash = readBootConfig().splash ?? {}
const splashRoot = document.getElementById('loading-screen')
if (splashRoot) applySplashSkin(splashRoot, hostSplash)
/** Our own early line, or the host's first message when it set any (`[]` keeps the line empty). */
const bootSay = (text: string) => {
  if (bootStatus)
    bootStatus.textContent = hostSplash.messages ? splashMessageAt(hostSplash.messages, 0) : text
}
/** Keep the HTML from saying «Initializing...» while modules and the entry probe run. */
bootSay('Cargando el motor…')

const entry = await resolveEntry()
bootSay(entry.mode === 'terrain' ? 'Cargando el terreno…' : 'Preparando la sesión…')
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
