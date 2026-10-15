/** Print the effective catalog, not a second manually maintained key list. */
import { controlsFor, keyLabel, inputChords } from '../dist/config/controls.js'
const contexts = [
  { name: 'A pie', mode: 'walk' },
  { name: 'Coche / camión', mode: 'road' },
  { name: 'Moto', mode: 'bike' },
  { name: 'Toro', mode: 'forklift' },
  { name: 'Vuelo', mode: 'flight' },
  { name: 'Arma a pie', mode: 'walk', weapon: true },
  { name: 'Arma apuntando', mode: 'walk', weapon: true, aiming: true },
  { name: 'Menú vehículo', mode: 'road', menu: true },
  { name: 'Menú toro', mode: 'forklift', menu: true },
  { name: 'Visor libre', mode: 'viewer' },
  { name: 'Lanzador HeadSet', mode: 'launcher' },
]
const resolved = contexts.map(({ name, ...context }) => ({
  name,
  context,
  controls: controlsFor(context),
}))
if (process.argv.includes('--json'))
  console.log(JSON.stringify({ contexts: resolved, chords: inputChords }, null, 2))
else
  for (const { name, controls } of resolved) {
    console.log(`\n${name}\n`)
    for (const binding of controls)
      console.log(
        `${[...new Set(binding.keys.map(keyLabel))].join('/').padEnd(22)} ${binding.label} [${binding.action}]`,
      )
  }
