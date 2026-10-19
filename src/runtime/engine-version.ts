/**
 * Engine semantic version (package.json "version"). `npm run build` replaces the placeholder in
 * the emitted file (scripts/finalize-package.mjs); an unbuilt source tree reports null.
 */
const injected: string = '__NABLA_ENGINE_VERSION__'

export const engineVersion: string | null = /^\d+\.\d+\.\d+/.test(injected) ? injected : null

/** Small, discreet `v0.3.1` label at the bottom-right of the game screen (version only). */
export function mountEngineVersionLabel(
  parent: HTMLElement,
  version = engineVersion,
): HTMLElement | null {
  if (!version || typeof document === 'undefined') return null
  const label = document.createElement('div')
  label.className = 'nabla-engine-version'
  label.textContent = `v${version}`
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText =
    'position:fixed;right:6px;bottom:4px;z-index:5;pointer-events:none;user-select:none;' +
    'font:10px/1 system-ui,sans-serif;color:#fff;opacity:.35;text-shadow:0 1px 2px #000'
  parent.append(label)
  return label
}
