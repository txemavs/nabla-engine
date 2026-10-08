/** Read-only, reproducible inventory; Node 22.18+ strips these TypeScript types. */
import { moduleGraph, reachable } from './lib/module-graph.ts'
const graph = moduleGraph(process.cwd())
const entries = {
  menus: ['src/render/monitors/menu.ts'],
  monitors: ['src/render/monitors/layered-monitor.ts'],
  boats: ['src/simulation/vehicles/boat.ts'],
  flight: ['src/simulation/vehicles/flight.ts'],
  wheeled: ['src/simulation/vehicles/wheeled/index.ts'],
  twoWheeled: ['src/simulation/vehicles/two-wheeled/index.ts'],
  drivetrain: ['src/simulation/vehicles/drivetrain.ts'],
  catalog: ['src/catalog/vehicles/index.ts'],
  instruments: ['src/render/entity/car-instruments.ts'],
}
console.log(
  JSON.stringify(
    {
      schemaVersion: 1,
      scope: 'src/**/*.ts; literal imports/reexports; computed imports flagged',
      modules: Object.fromEntries(
        Object.entries(entries).map(([name, files]) => [
          name,
          {
            entries: files,
            runtime: [...reachable(graph, files)].sort(),
            includingTypes: [...reachable(graph, files, true)].sort(),
          },
        ]),
      ),
      edges: graph,
    },
    null,
    2,
  ),
)
