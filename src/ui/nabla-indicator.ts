/**
 * Nabla status indicator component.
 *
 * Renders a hollow blue downward-pointing triangle (nabla symbol: base on top,
 * tip pointing down) with three visual states:
 * - normal: static triangle
 * - reconnecting: subtle pulsing animation
 * - error: red color
 *
 * Brand rule: the triangle always points DOWN. Never rotate it point-up.
 */

export type NablaIndicatorState = 'normal' | 'reconnecting' | 'error'

const INDICATOR_SIZE = 16
const STROKE_WIDTH = 2
const NORMAL_COLOR = '#4a9eff'
const ERROR_COLOR = '#ff4444'

const ANIMATION_KEYFRAMES = `
@keyframes nabla-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
`

let styleInjected = false

function injectStyles(): void {
  if (styleInjected || typeof document === 'undefined') return
  const style = document.createElement('style')
  style.textContent = ANIMATION_KEYFRAMES
  document.head.appendChild(style)
  styleInjected = true
}

/**
 * Create an inline SVG element for the Nabla indicator.
 *
 * The triangle is hollow (stroke only, no fill) with base at top and tip at bottom.
 */
export function createNablaIndicator(
  state: NablaIndicatorState = 'normal',
  size: number = INDICATOR_SIZE,
): SVGSVGElement {
  injectStyles()

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('nabla-indicator')

  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
  polygon.setAttribute('points', '12,20 3,6 21,6')
  polygon.setAttribute('fill', 'none')
  polygon.setAttribute('stroke-width', String(STROKE_WIDTH))
  polygon.setAttribute('stroke-linejoin', 'round')
  polygon.setAttribute('stroke-linecap', 'round')

  applyState(svg, polygon, state)

  svg.appendChild(polygon)
  return svg
}

function applyState(
  svg: SVGSVGElement,
  polygon: SVGPolygonElement,
  state: NablaIndicatorState,
): void {
  svg.style.animation = ''
  svg.dataset.state = state

  switch (state) {
    case 'normal':
      polygon.setAttribute('stroke', NORMAL_COLOR)
      break
    case 'reconnecting':
      polygon.setAttribute('stroke', NORMAL_COLOR)
      svg.style.animation = 'nabla-pulse 1.5s ease-in-out infinite'
      break
    case 'error':
      polygon.setAttribute('stroke', ERROR_COLOR)
      break
  }
}

/**
 * Update an existing Nabla indicator element's state.
 */
export function updateNablaIndicator(svg: SVGSVGElement, state: NablaIndicatorState): void {
  const polygon = svg.querySelector('polygon')
  if (polygon) {
    applyState(svg, polygon, state)
  }
}

/**
 * Create an HTML string for the Nabla indicator (for innerHTML injection).
 *
 * Includes inline styles so no external CSS is needed. For the reconnecting
 * state, the animation is applied via a style attribute.
 */
export function nablaIndicatorHTML(
  state: NablaIndicatorState = 'normal',
  size: number = INDICATOR_SIZE,
): string {
  const color = state === 'error' ? ERROR_COLOR : NORMAL_COLOR
  const animation =
    state === 'reconnecting' ? 'animation: nabla-pulse 1.5s ease-in-out infinite;' : ''

  const styleBlock =
    state === 'reconnecting'
      ? `<style>@keyframes nabla-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }</style>`
      : ''

  return `${styleBlock}<svg class="nabla-indicator" data-state="${state}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="vertical-align: middle; margin-right: 6px; ${animation}"><polygon points="12,20 3,6 21,6" fill="none" stroke="${color}" stroke-width="${STROKE_WIDTH}" stroke-linejoin="round" stroke-linecap="round"/></svg>`
}

/**
 * Prepend the Nabla indicator to a status message.
 *
 * Returns HTML with the indicator followed by the message text.
 */
export function withNablaIndicator(message: string, state: NablaIndicatorState = 'normal'): string {
  return `${nablaIndicatorHTML(state)}${escapeHTML(message)}`
}

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
