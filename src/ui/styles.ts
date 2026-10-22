/**
 * The engine's one UI stylesheet (src/ui/styles, documented in docs/ui-theme.md): tokens first,
 * then components. Game pages install it first thing from game/ui-styles.ts; the runtime calls
 * {@link installEngineStyles} too, so package consumers get it without a page script. Plain
 * CSS consumers can link `styles/index.css` (with `data-nabla-ui`) instead.
 */
import {
  base,
  buttons,
  hud,
  loading,
  menu,
  monitors,
  panels,
  settings,
  tokens,
  touch,
  xrCalibration,
} from './styles.generated.js'

/** Sheet files in cascade order; styles/index.css imports the same list. */
export const engineStyleSheets = {
  tokens,
  base,
  buttons,
  hud,
  touch,
  menu,
  settings,
  panels,
  loading,
} as const

/** The whole screen-space stylesheet as one string. */
export const engineStyleText: string = Object.values(engineStyleSheets).join('\n')

/** World-space monitor sheet (CSS3D panels), installed per monitor layer. */
export const monitorStyleText: string = monitors

/** Self-contained sheet for the rasterised XR calibration screen (tokens + its component). */
export const xrCalibrationStyleText: string = tokens + '\n' + xrCalibration

export const ENGINE_STYLE_ID = 'nabla-ui-styles'

/**
 * Add the engine stylesheet once per document. A page that links `styles/index.css` (marked
 * `data-nabla-ui`) already has it, so nothing is added. Returns true when it is in place.
 */
export function installEngineStyles(doc: Document | undefined = globalThis.document): boolean {
  if (!doc?.head) return false
  if (doc.getElementById(ENGINE_STYLE_ID) || doc.querySelector('link[data-nabla-ui]')) return true
  const style = doc.createElement('style')
  style.id = ENGINE_STYLE_ID
  style.textContent = engineStyleText
  // First in <head>, so host token overrides that follow it win by order.
  doc.head.prepend(style)
  return true
}
