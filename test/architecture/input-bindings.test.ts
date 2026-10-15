import { expect, it } from 'vitest'
import { parse } from '@babel/parser'
import { readFileSync, readdirSync } from 'node:fs'

it('keeps physical keyboard declarations in the catalog, apart from the dependency-free legacy menu adapter', () => {
  const allowed = new Set(['src/config/input-bindings.ts', 'src/render/monitors/menu.ts'])
  const physical =
    /^(Key[A-Z]|Arrow(?:Up|Down|Left|Right)|Space|Tab|Escape|Enter|PageUp|PageDown|ShiftLeft|ShiftRight|F\d+)$/
  const found: string[] = []
  for (const root of ['src', 'game']) {
    for (const entry of readdirSync(root, { recursive: true })) {
      const file = `${root}/${entry}`.replaceAll('\\', '/')
      if (!file.endsWith('.ts') || file.endsWith('.d.ts') || allowed.has(file)) continue
      const ast = parse(readFileSync(file, 'utf8'), {
        sourceType: 'module',
        plugins: ['typescript'],
      })
      const visit = (value: unknown): void => {
        if (!value || typeof value !== 'object') return
        if (Array.isArray(value)) {
          for (const child of value) visit(child)
          return
        }
        const node = value as { type?: string; value?: string; loc?: { start: { line: number } } }
        if (node.type === 'StringLiteral' && node.value && physical.test(node.value))
          found.push(`${file}:${node.loc?.start.line} ${node.value}`)
        for (const [key, child] of Object.entries(value))
          if (
            ![
              'comments',
              'leadingComments',
              'trailingComments',
              'innerComments',
              'tokens',
            ].includes(key)
          )
            visit(child)
      }
      visit(ast.program)
    }
  }
  expect(found).toEqual([])
})
