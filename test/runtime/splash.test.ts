import { describe, expect, it } from 'vitest'
import {
  applySplashSkin,
  defaultNablaSplashSkin,
  resolveSplashSkin,
  splashMessageAt,
} from '../../src/runtime/splash.js'

/** Minimal DOM stand-in: enough for the splash slots without a browser. */
class FakeElement {
  id = ''
  textContent: string | null = ''
  hidden = false
  src = ''
  alt = ''
  dataset: Record<string, string> = {}
  children: FakeElement[] = []
  attributes = new Map<string, string>()
  private classes = new Set<string>()
  classList = {
    toggle: (name: string, on: boolean) =>
      on ? this.classes.add(name) : this.classes.delete(name),
    contains: (name: string) => this.classes.has(name),
  }
  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}
  get firstChild() {
    return this.children[0] ?? null
  }
  querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (
        (selector.startsWith('#') && child.id === selector.slice(1)) ||
        child.tagName === selector ||
        (selector.startsWith('style[') && child.tagName === 'style' && child.attributes.size)
      )
        return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }
  insertBefore(node: FakeElement, before: FakeElement | null) {
    const index = before ? this.children.indexOf(before) : -1
    if (index < 0) this.children.push(node)
    else this.children.splice(index, 0, node)
  }
  appendChild(node: FakeElement) {
    this.children.push(node)
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value)
  }
  getAttribute(name: string) {
    return name === 'src' ? this.src || null : (this.attributes.get(name) ?? null)
  }
}
class FakeDocument {
  head = new FakeElement('head', this)
  createElement(tag: string) {
    return new FakeElement(tag, this)
  }
  querySelector(selector: string) {
    return this.head.querySelector(selector)
  }
}

function splashDom() {
  const doc = new FakeDocument()
  const root = doc.createElement('div')
  root.id = 'loading-screen'
  const title = doc.createElement('h1')
  title.id = 'loading-title'
  title.textContent = 'NABLA ENGINE'
  const status = doc.createElement('div')
  status.id = 'loading-status'
  root.appendChild(title)
  root.appendChild(status)
  return { doc, root, title, status }
}

describe('engine splash skin', () => {
  it('keeps the Nabla default when the host passes nothing', () => {
    expect(resolveSplashSkin()).toMatchObject({ title: 'NABLA ENGINE', layout: 'centered' })
    const { root, title, status } = splashDom()
    applySplashSkin(root as never)
    expect(title.textContent).toBe('NABLA ENGINE')
    expect(status.textContent).toBe(defaultNablaSplashSkin.messages![0])
    expect(root.dataset.splashLayout).toBe('centered')
  })

  it('applies a host logo, title, messages, corner layout and theme CSS', () => {
    const { doc, root, title, status } = splashDom()
    applySplashSkin(root as never, {
      logoUrl: '/brand/euskadi-online.svg',
      title: 'EUSKADI ONLINE',
      messages: ['Kargatzen…', 'Mapa prestatzen…'],
      layout: 'corner',
      themeCss: '#loading-screen { --splash-accent: #00a650; }',
    })
    expect(title.textContent).toBe('EUSKADI ONLINE')
    expect(status.textContent).toBe('Kargatzen…')
    expect(root.querySelector('#loading-logo')?.src).toBe('/brand/euskadi-online.svg')
    expect(root.classList.contains('splash-corner')).toBe(true)
    expect(root.dataset.splashLayout).toBe('corner')
    expect(doc.head.children[0]?.textContent).toContain('--splash-accent: #00a650')
  })

  it('picks load messages by boot progress', () => {
    const messages = ['a', 'b', 'c']
    expect(splashMessageAt(messages, 0)).toBe('a')
    expect(splashMessageAt(messages, 0.5)).toBe('b')
    expect(splashMessageAt(messages, 1)).toBe('c')
    expect(splashMessageAt(undefined, 0)).toBe(defaultNablaSplashSkin.messages![0])
  })
})
