/** Shared SVG icons for touch action buttons (label via aria-label only - never text). */
export function touchActionIcon(action: string): string {
  const common =
    'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'
  if (action === 'play')
    return `<svg ${common}><polygon points="8 5 19 12 8 19 8 5" fill="currentColor" stroke="none"/></svg>`
  if (action === 'camera')
    return `<svg ${common}><path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`
  if (action === 'interact')
    return `<svg ${common}><path d="M10 3h4v7h4l-6 7-6-7h4z"/><path d="M5 20h14"/></svg>`
  if (action === 'brake')
    return `<svg ${common}><rect x="7" y="4" width="10" height="16" rx="2"/><path d="M10 8h4"/></svg>`
  return `<svg ${common}><circle cx="12" cy="12" r="7"/></svg>`
}
