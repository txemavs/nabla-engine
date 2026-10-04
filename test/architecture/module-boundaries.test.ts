import { expect, it } from 'vitest'
import { importEdges, moduleGraph, reachable } from '../../scripts/lib/module-graph.js'
const graph = moduleGraph(process.cwd())
it('simulation subsystems cannot depend on their coordinator or browser runtime', () => {
  for (const name of [
    'contracts',
    'entity-body',
    'map-collisions',
    'terrain-boundary',
    'catch-floor',
    'road-assist',
    'portal-clearance',
    'portal-traversal',
    'vehicle-docking',
  ]) {
    const closure = [...reachable(graph, [`src/simulation/${name}.ts`], true)]
    expect(closure).not.toContain('src/simulation/simulation.ts')
    expect(closure.filter((path) => /^src\/(runtime|render)\//.test(path))).toEqual([])
  }
})
it('requires explicit review before computed module loading can bypass boundaries', () => {
  expect(graph.filter((e) => e.to === '<computed import>')).toEqual([])
})
it('keeps every engine source independent of Studio, including type imports', () => {
  expect(graph.filter((e) => /(^|\/)studio\//.test(e.to))).toEqual([])
})
it('keeps reusable menus dependency-free and monitors independent of vehicles/catalog', () => {
  expect(graph.filter((e) => e.from === 'src/render/monitors/menu.ts')).toEqual([])
  const monitor = [...reachable(graph, ['src/render/monitors/layered-monitor.ts'], true)]
  expect(
    monitor.filter((p) => /^(src\/(simulation|catalog|entity\/vehicle)|studio)\//.test(p)),
  ).toEqual([])
})
it('keeps vehicle behaviours free of presentation/catalog runtime imports', () => {
  const runtime = [
    ...reachable(graph, [
      'src/simulation/vehicles/boat.ts',
      'src/simulation/vehicles/drivetrain.ts',
      'src/simulation/vehicles/keyboard-steering.ts',
    ]),
  ]
  expect(runtime.filter((p) => /^(src\/(render|catalog)|studio)\//.test(p))).toEqual([])
})
it('keeps vehicle presets independent of physics and rendering at runtime', () => {
  const runtime = [...reachable(graph, ['src/catalog/vehicles/index.ts'])]
  expect(runtime.filter((p) => /^(src\/(render|simulation)|studio)\//.test(p))).toEqual([])
})
it('keeps all renderer code independent of stock catalog recipes', () => {
  expect(
    graph
      .filter((e) => e.from.startsWith('src/render/') && e.to.startsWith('src/catalog/'))
      .map((e) => [e.from, e.to])
      .sort(),
  ).toEqual([])
  const instruments = [...reachable(graph, ['src/render/entity/car-instruments.ts'])]
  expect(instruments.filter((p) => p.startsWith('src/catalog/'))).toEqual([])
})
it('detects transitive reexports, type-only edges, lazy imports and computed imports', () => {
  const files = new Set(['src/a.ts', 'src/b.ts', 'src/c.ts'])
  const edges = importEdges(
    'src/a.ts',
    `import type { X } from './b.js'; export * from './c.js'; const lazy=()=>import('./b.js'); const unknown=()=>import(url);`,
    files,
  )
  expect(edges.map((e) => [e.to, e.kind])).toEqual([
    ['src/b.ts', 'type'],
    ['src/c.ts', 'runtime'],
    ['src/b.ts', 'runtime'],
    ['<computed import>', 'runtime'],
  ])
  const transitive = [
    ...edges,
    ...importEdges('src/c.ts', `export * from '../studio/host.js'`, files),
  ]
  expect(reachable(transitive, ['src/a.ts']).has('studio/host.js')).toBe(true)
})

it('public menus have no dependencies and layered monitors load HTML only lazily', () => {
  const staticGraph = graph.filter((e) => e.form !== 'dynamic')
  const runtime = [...reachable(staticGraph, ['src/render/monitors/index.ts'])]
  expect(runtime).not.toContain('src/render/monitors/html-monitor.ts')
  expect(runtime.filter((p) => /catalog|simulation|entity\/|menu\.ts/.test(p))).toEqual([])
  expect([...reachable(graph, ['src/render/monitors/menu.ts'])]).toEqual([
    'src/render/monitors/menu.ts',
  ])
  const presets = [...reachable(graph, ['src/catalog/monitors/index.ts'])]
  expect(presets.filter((p) => /render|simulation|catalog\/vehicles/.test(p))).toEqual([])
})

it('equipment controllers cannot import stock models, physics or Studio', () => {
  const closure = [...reachable(graph, ['src/render/vehicle-presentation/index.ts'])]
  expect(closure.filter((p) => /^(src\/(catalog|simulation)|studio)\//.test(p))).toEqual([])
})

it('wheeled runtime has no Simulation, entity schema, catalogue, render, boat or Studio dependency, including types', () => {
  const closure = [...reachable(graph, ['src/simulation/vehicles/wheeled/index.ts'], true)]
  expect(
    closure.filter(
      (p) =>
        /^(src\/(catalog|render|entity)|studio)\//.test(p) ||
        p === 'src/simulation/simulation.ts' ||
        p === 'src/simulation/vehicles/boat.ts',
    ),
  ).toEqual([])
})

it('boat and flight runtimes do not import cars, scenes or presentation, even as types', () => {
  for (const entry of ['boat', 'flight']) {
    const closure = [...reachable(graph, [`src/simulation/vehicles/${entry}.ts`], true)]
    expect(
      closure.filter((p) =>
        /src\/(entity|catalog|render)\/|studio\/|wheeled|drivetrain|simulation\/simulation/.test(p),
      ),
    ).toEqual([])
  }
})
