import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import {
  createNablaIndicator,
  updateNablaIndicator,
  nablaIndicatorHTML,
  withNablaIndicator,
} from '../../src/ui/nabla-indicator.js'

beforeEach(() => {
  vi.stubGlobal('document', {
    getElementById: () => null,
    createElement: (tag: string) => ({
      tagName: tag.toUpperCase(),
      setAttribute: vi.fn(),
      style: {},
      classList: { add: vi.fn() },
      appendChild: vi.fn(),
      textContent: '',
    }),
    createElementNS: (ns: string, tag: string) => {
      const el = {
        tagName: tag.toUpperCase(),
        namespaceURI: ns,
        attributes: new Map<string, string>(),
        children: [] as object[],
        style: {} as Record<string, string>,
        classList: { add: vi.fn() },
        dataset: {} as Record<string, string>,
        setAttribute(name: string, value: string) {
          this.attributes.set(name, value)
        },
        getAttribute(name: string) {
          return this.attributes.get(name)
        },
        appendChild(child: object) {
          this.children.push(child)
        },
        querySelector(selector: string) {
          if (selector === 'polygon' && this.children.length > 0) {
            return this.children[0]
          }
          return null
        },
      }
      return el
    },
    head: { appendChild: vi.fn() },
  })
})

afterEach(() => vi.unstubAllGlobals())

describe('createNablaIndicator', () => {
  it('creates an SVG element with a downward-pointing triangle', () => {
    const svg = createNablaIndicator()
    expect(svg.tagName).toBe('SVG')
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.children.length).toBe(1)
    const polygon = svg.children[0] as { getAttribute: (k: string) => string | undefined }
    expect(polygon.getAttribute('points')).toBe('12,20 3,6 21,6')
    expect(polygon.getAttribute('fill')).toBe('none')
  })

  it('applies blue stroke for normal state', () => {
    const svg = createNablaIndicator('normal')
    const polygon = svg.children[0] as { getAttribute: (k: string) => string | undefined }
    expect(polygon.getAttribute('stroke')).toBe('#4a9eff')
    expect(svg.style.animation).toBe('')
  })

  it('applies pulsing animation for reconnecting state', () => {
    const svg = createNablaIndicator('reconnecting')
    expect(svg.style.animation).toContain('nabla-pulse')
    const polygon = svg.children[0] as { getAttribute: (k: string) => string | undefined }
    expect(polygon.getAttribute('stroke')).toBe('#4a9eff')
  })

  it('applies red stroke for error state', () => {
    const svg = createNablaIndicator('error')
    const polygon = svg.children[0] as { getAttribute: (k: string) => string | undefined }
    expect(polygon.getAttribute('stroke')).toBe('#ff4444')
    expect(svg.style.animation).toBe('')
  })

  it('uses custom size when provided', () => {
    const svg = createNablaIndicator('normal', 24)
    expect(svg.getAttribute('width')).toBe('24')
    expect(svg.getAttribute('height')).toBe('24')
  })
})

describe('updateNablaIndicator', () => {
  it('updates state from normal to error', () => {
    const svg = createNablaIndicator('normal')
    updateNablaIndicator(svg as unknown as SVGSVGElement, 'error')
    const polygon = svg.children[0] as { getAttribute: (k: string) => string | undefined }
    expect(polygon.getAttribute('stroke')).toBe('#ff4444')
  })

  it('updates state from normal to reconnecting', () => {
    const svg = createNablaIndicator('normal')
    updateNablaIndicator(svg as unknown as SVGSVGElement, 'reconnecting')
    expect(svg.style.animation).toContain('nabla-pulse')
  })
})

describe('nablaIndicatorHTML', () => {
  it('returns HTML string with SVG for normal state', () => {
    const html = nablaIndicatorHTML('normal')
    expect(html).toContain('<svg')
    expect(html).toContain('points="12,20 3,6 21,6"')
    expect(html).toContain('fill="none"')
    expect(html).toContain('stroke="#4a9eff"')
    expect(html).toContain('data-state="normal"')
    expect(html).not.toContain('@keyframes')
  })

  it('includes animation style block for reconnecting state', () => {
    const html = nablaIndicatorHTML('reconnecting')
    expect(html).toContain('@keyframes nabla-pulse')
    expect(html).toContain('animation: nabla-pulse')
  })

  it('applies red stroke for error state', () => {
    const html = nablaIndicatorHTML('error')
    expect(html).toContain('stroke="#ff4444"')
  })
})

describe('withNablaIndicator', () => {
  it('prepends indicator to message', () => {
    const html = withNablaIndicator('Loading…', 'reconnecting')
    expect(html).toContain('<svg')
    expect(html).toContain('Loading…')
    expect(html.indexOf('<svg')).toBeLessThan(html.indexOf('Loading'))
  })

  it('escapes HTML in message', () => {
    const html = withNablaIndicator('<script>alert(1)</script>', 'normal')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script>')
  })

  it('handles empty message', () => {
    const html = withNablaIndicator('', 'normal')
    expect(html).toContain('<svg')
  })
})

describe('triangle points down (nabla orientation)', () => {
  it('has base at top (y=6) and tip at bottom (y=20)', () => {
    const html = nablaIndicatorHTML()
    const pointsMatch = html.match(/points="([^"]+)"/)
    expect(pointsMatch).not.toBeNull()
    const points = pointsMatch![1]
    const [tip, left, right] = points.split(' ').map((p) => {
      const [x, y] = p.split(',').map(Number)
      return { x, y }
    })
    expect(tip.y).toBe(20)
    expect(left.y).toBe(6)
    expect(right.y).toBe(6)
    expect(tip.x).toBe(12)
  })
})
