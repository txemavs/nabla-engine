import fs from 'node:fs'
import path from 'node:path'
import { parse } from '@babel/parser'
export interface Edge {
  from: string
  to: string
  kind: 'runtime' | 'type'
  form: string
}
export function importEdges(file: string, text: string, files: Set<string>): Edge[] {
  const edges: Edge[] = []
  const source = parse(text, {
    sourceType: 'module',
    plugins: ['typescript'],
    createImportExpressions: true,
  })
  const add = (specifier: string, typeOnly: boolean, form: string) => {
    let to = specifier
    if (specifier.startsWith('.')) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier))
      to =
        [resolved, resolved.replace(/\.js$/, '.ts'), resolved + '/index.ts'].find((p) =>
          files.has(p),
        ) ?? resolved
    }
    edges.push({ from: file, to, kind: typeOnly ? 'type' : 'runtime', form })
  }
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const literal = (value: unknown): string | undefined => {
    const n = record(value)
    return n.type === 'StringLiteral' ? String(n.value) : undefined
  }
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const n = record(value)
    if (
      n.type === 'ImportDeclaration' ||
      n.type === 'ExportNamedDeclaration' ||
      n.type === 'ExportAllDeclaration'
    ) {
      const specifier = literal(n.source)
      const parts = Array.isArray(n.specifiers) ? n.specifiers : []
      const typeOnly =
        n.importKind === 'type' ||
        n.exportKind === 'type' ||
        (parts.length > 0 &&
          parts.every((p) => record(p).importKind === 'type' || record(p).exportKind === 'type'))
      if (specifier) add(specifier, typeOnly, n.type === 'ImportDeclaration' ? 'import' : 'export')
    } else if (n.type === 'ImportExpression')
      add(literal(n.source) ?? '<computed import>', false, 'dynamic')
    else if (n.type === 'CallExpression' && record(n.callee).name === 'require')
      add(literal((n.arguments as unknown[])[0]) ?? '<computed import>', false, 'dynamic')
    else if (n.type === 'TSImportType') {
      const specifier = literal(n.argument)
      if (specifier) add(specifier, true, 'import-type')
    }
    for (const [key, child] of Object.entries(n))
      if (
        !['loc', 'start', 'end', 'comments', 'tokens'].includes(key) &&
        child &&
        typeof child === 'object'
      )
        visit(child)
  }
  visit(source)
  return edges
}
export function moduleGraph(root: string): Edge[] {
  const files: string[] = []
  function walk(dir: string) {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = dir + '/' + e.name
      if (e.isDirectory()) walk(file)
      else if (file.endsWith('.ts')) files.push(file)
    }
  }
  walk('src')
  const known = new Set(files)
  return files
    .sort()
    .flatMap((file) => importEdges(file, fs.readFileSync(path.join(root, file), 'utf8'), known))
}
export function reachable(graph: Edge[], entries: string[], includeTypes = false): Set<string> {
  const seen = new Set<string>(),
    pending = [...entries]
  while (pending.length) {
    const file = pending.pop()!
    if (seen.has(file)) continue
    seen.add(file)
    for (const edge of graph)
      if (edge.from === file && (includeTypes || edge.kind === 'runtime')) pending.push(edge.to)
  }
  return seen
}
