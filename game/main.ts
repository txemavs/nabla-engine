import { startBootPhase, summarizeBootTrace } from '../src/runtime/boot-trace.js'
import { pageAddress, pageSearch } from './page-query.js'
/** Entry point: the terrain chosen by the URL or the menu (plane, GLB, streamed terrain). */
// Must stay first: VR modes keep their own saved settings (settings-scope.ts).
import './settings-scope-boot.js'
import { applySplashSkin, splashMessageAt } from '@nabla/engine/runtime/splash'
import { readBootConfig } from './boot.js'
import { resolveEntry } from './entry.js'
import { applyDocumentLocale, t } from '@nabla/engine/i18n'

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
applyDocumentLocale()
bootSay(t('boot.loading-engine'))

startBootPhase('Navegación y descarga/evaluación de módulos iniciales', 0, '01 Entrada')()
const sourceDone = startBootPhase('Seleccionar fuente del mundo', undefined, '01 Entrada')
const entry = await resolveEntry()
sourceDone()
const hostDone = startBootPhase(
  `Importar y ejecutar página de juego: ${entry.mode}`,
  undefined,
  'Contenedores',
)
bootSay(entry.mode === 'terrain' ? t('boot.loading-terrain') : t('boot.preparing-the-session'))
console.info(
  `[nabla-boot] entry ${entry.mode} after ${(performance.now() - bootMark).toFixed(0)}ms`,
)
// Show the address that is really played, so reloading or sharing it repeats this session.
if (entry.search !== pageSearch())
  history.replaceState(null, '', pageAddress(entry.search || location.pathname))
// Literal import() paths so Vite can pre-transform both graphs (ternary was opaque).
if (entry.mode === 'terrain') await import('./terrain-main.js')
else await import('./drive.js')
hostDone()
summarizeBootTrace()
console.info(`[nabla-boot] host module ready after ${(performance.now() - bootMark).toFixed(0)}ms`)
