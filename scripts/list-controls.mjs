/** Print the effective catalog, not a second manually maintained key list. */
import { controlsFor, keyLabel, inputChords, inputBindings } from '../dist/config/controls.js'
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
else {
  const groups = [
    ['Comunes', []],
    ['Vehículos', []],
    ['A pie', []],
    ['Moto', []],
    ['Toro', []],
    ['Vuelo', []],
    ['Arma desenfundada', []],
    ['Apuntando', []],
    ['Menús', []],
    ['Visor libre', []],
    ['Lanzador HeadSet', []],
  ]
  for (const [action, binding] of Object.entries(inputBindings)) {
    if (!binding.keys.length) continue
    const scopes = binding.scopes
    const group =
      scopes.includes('game') || (scopes.includes('walk') && scopes.length > 1)
        ? 0
        : scopes.includes('vehicle') || scopes.includes('road')
          ? 1
          : scopes.includes('walk')
            ? 2
            : scopes.includes('bike')
              ? 3
              : scopes.includes('forklift')
                ? 4
                : scopes.includes('flight')
                  ? 5
                  : scopes.includes('weapon') || scopes.includes('weapon.walk')
                    ? 6
                    : scopes.includes('aim')
                      ? 7
                      : scopes.includes('menu')
                        ? 8
                        : scopes.includes('viewer')
                          ? 9
                          : 10
    groups[group][1].push({ action, ...binding })
  }
  const first = ['pointer.release', 'move.forward', 'move.back', 'move.right', 'move.left']
  groups[0][1].sort((a, b) => {
    const rank = (action) => (first.includes(action) ? first.indexOf(action) : first.length)
    return rank(a.action) - rank(b.action)
  })
  const bindings = groups.flatMap(([, rows]) => rows)
  const descriptionWidth = 40
  const actionWidth = Math.max(...bindings.map((row) => row.action.length + 2)) + 2
  const row = (label, action, keys) => {
    const lines = ['']
    for (const word of label.split(' ')) {
      const current = lines.length - 1
      if (lines[current] && lines[current].length + word.length + 1 > descriptionWidth)
        lines.push(word)
      else lines[current] += (lines[current] ? ' ' : '') + word
    }
    const first = `${lines.shift().padEnd(descriptionWidth)} ${`[${action}]`.padEnd(actionWidth)} ${keys}`
    return [first, ...lines].join('\n')
  }
  for (const [name, controls] of groups) {
    console.log(`${name}\n`)
    for (const binding of controls)
      console.log(
        row(binding.label, binding.action, [...new Set(binding.keys.map(keyLabel))].join('/')),
      )
    console.log('')
  }
  console.log('Combinaciones\n')
  const labels = { prone: 'Cuerpo a tierra', launch: 'Salida fuerte / gas completo' }
  for (const [name, actions] of Object.entries(inputChords))
    console.log(
      row(
        labels[name] ?? name,
        name,
        actions
          .map((action) => [...new Set(inputBindings[action].keys.map(keyLabel))].join('/'))
          .join(' + '),
      ),
    )
  console.log('\nNotas\n')
  console.log(
    'Las comunes se aplican donde el contexto admita la acción; vuelo y visor tienen ejes propios.',
  )
  console.log('Armas, apuntado y menús tienen prioridad sobre los controles generales.')
  console.log(
    'J (menú) y K (largas/cortas) no se aplican al toro: P abre su menú y J/K son hidráulicos.',
  )
  console.log('Las funciones de un vehículo solo actúan si el modelo las admite.')
  console.log('Inspección + clic izquierdo conmuta el seguro del arma.')
  console.log('Ratón: clic izquierdo dispara; clic derecho apunta.')
  console.log(
    'La salida fuerte también se solicita manteniendo Shift. En moto con gas completo, Espacio aplica freno delantero completo.',
  )
}
