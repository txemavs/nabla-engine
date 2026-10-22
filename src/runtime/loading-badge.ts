import { installEngineStyles } from '../ui/styles.js'

/** Small "loading" pill over the game canvas while a vehicle is being prepared (styles: loading.css). */
/** Show the pill in `host`; call the returned function to remove it. No-op without a DOM. */
export function showLoadingBadge(
  host: HTMLElement | null | undefined,
  label: string,
): (() => void) & { update(label: string): void } {
  if (!host || typeof document === 'undefined')
    return Object.assign(() => {}, { update: (_label: string) => {} })
  const badge = document.createElement('div')
  badge.className = 'nabla-loading-badge'
  badge.setAttribute('role', 'status')
  installEngineStyles(document)
  const spinner = document.createElement('i')
  const text = document.createElement('span')
  text.textContent = label
  badge.append(spinner, text)
  host.append(badge)
  return Object.assign(() => badge.remove(), {
    update: (label: string) => {
      text.textContent = label
    },
  })
}
