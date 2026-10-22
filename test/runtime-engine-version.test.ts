import { expect, it, vi } from 'vitest'
import { engineVersion, mountEngineVersionLabel } from '../src/runtime/engine-version.js'

it('shows only the semantic version, styled by the stylesheet class', () => {
  const element = { style: { cssText: '' }, textContent: '', className: '', setAttribute() {} }
  vi.stubGlobal('document', { createElement: () => element })
  const parent = { append: vi.fn() }
  try {
    const label = mountEngineVersionLabel(parent as unknown as HTMLElement, '0.3.1')
    expect(label?.textContent).toBe('v0.3.1')
    expect(element.className).toBe('nabla-engine-version')
    expect(element.style.cssText).toBe('')
    expect(parent.append).toHaveBeenCalledOnce()
    expect(mountEngineVersionLabel(parent as unknown as HTMLElement, null)).toBeNull()
  } finally {
    vi.unstubAllGlobals()
  }
})

it('an unbuilt source tree has no version (the build injects it)', () => {
  expect(engineVersion).toBeNull()
})
