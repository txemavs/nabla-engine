/** Small "loading" pill over the game canvas while a vehicle is being prepared. */
const style = `
.nabla-loading-badge { position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
 z-index: 50; display: flex; align-items: center; gap: 8px; padding: 6px 12px;
 border-radius: 999px; background: #111827cc; color: #fff; font: 13px system-ui, sans-serif;
 pointer-events: none; }
.nabla-loading-badge i { width: 12px; height: 12px; border-radius: 50%;
 border: 2px solid #ffffff55; border-top-color: #fff; animation: nabla-spin .8s linear infinite; }
@keyframes nabla-spin { to { transform: rotate(360deg); } }
`

/** Show the pill in `host`; call the returned function to remove it. No-op without a DOM. */
export function showLoadingBadge(host: HTMLElement | null | undefined, label: string): () => void {
  if (!host || typeof document === 'undefined') return () => {}
  const badge = document.createElement('div')
  badge.className = 'nabla-loading-badge'
  badge.setAttribute('role', 'status')
  const css = document.createElement('style')
  css.textContent = style
  const spinner = document.createElement('i')
  const text = document.createElement('span')
  text.textContent = label
  badge.append(css, spinner, text)
  host.append(badge)
  return () => badge.remove()
}
