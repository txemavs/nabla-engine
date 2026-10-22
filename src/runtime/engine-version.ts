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
  parent.append(label)
  return label
}
