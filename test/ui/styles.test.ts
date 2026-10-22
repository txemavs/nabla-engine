import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { engineStyleSheets, engineStyleText, monitorStyleText } from '../../src/ui/styles.js'
import { interfaceTheme } from '../../src/ui/theme.js'

const dir = new URL('../../src/ui/styles/', import.meta.url)
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.css'))
const read = (name: string) => fs.readFileSync(new URL(name, dir), 'utf8')

describe('engine UI stylesheet', () => {
  it('styles.generated.ts is up to date (node scripts/gen-ui-styles.mjs)', () => {
    const file = new URL('../../src/ui/styles.generated.ts', import.meta.url)
    const before = fs.readFileSync(file, 'utf8')
    execFileSync(process.execPath, [
      new URL('../../scripts/gen-ui-styles.mjs', import.meta.url).pathname,
    ])
    expect(fs.readFileSync(file, 'utf8')).toBe(before)
  })

  it('has no !important anywhere', () => {
    for (const name of files) expect(read(name), name).not.toContain('!important')
  })

  it('does not scale the interface with zoom or a scale token', () => {
    for (const name of files) {
      expect(read(name), name).not.toMatch(/\bzoom\s*:/)
      expect(read(name), name).not.toContain('--nabla-ui-scale')
    }
  })

  it('index.css imports the sheets in the order styles.ts installs them', () => {
    const imports = [...read('index.css').matchAll(/@import '\.\/([\w-]+)\.css'/g)].map((m) => m[1])
    expect(imports).toEqual(Object.keys(engineStyleSheets))
  })

  it('every sheet is either linked from index.css or installed on its own', () => {
    const own = ['index', 'monitors', 'xr-calibration']
    for (const name of files.map((file) => file.replace('.css', ''))) {
      expect(own.includes(name) || name in engineStyleSheets, name).toBe(true)
    }
    expect(engineStyleText).toContain('--nabla-btn-size')
    expect(monitorStyleText.length).toBeGreaterThan(0)
  })

  it('canvas theme colours match the CSS tokens', () => {
    const tokens = read('tokens.css')
    const token = (name: string) =>
      tokens.match(new RegExp(`--nabla-color-${name}:\\s*(#[0-9a-f]+)`, 'i'))?.[1]
    const long = (hex: string | undefined) =>
      hex && hex.length === 4 ? '#' + [...hex.slice(1)].map((c) => c + c).join('') : hex
    for (const [key, name] of [
      ['surface', 'surface'],
      ['button', 'button'],
      ['accent', 'accent'],
      ['background', 'bg'],
      ['ink', 'ink'],
      ['muted', 'muted'],
      ['line', 'line'],
      ['selected', 'selected'],
      ['pressed', 'pressed'],
    ] as const) {
      expect(long(token(name))?.toLowerCase(), key).toBe(interfaceTheme[key].toLowerCase())
    }
  })
})
