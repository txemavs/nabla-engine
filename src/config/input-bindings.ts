/** Physical input belongs here; simulation consumes semantic actions and PlayerInput. */
export type InputMode = 'walk' | 'road' | 'bike' | 'forklift' | 'flight' | 'viewer' | 'launcher'
export interface InputContext {
  mode: InputMode
  weapon?: boolean
  aiming?: boolean
  menu?: boolean
}
type Scope = InputMode | 'game' | 'vehicle' | 'weapon' | 'weapon.walk' | 'aim' | 'menu'
interface Binding {
  label: string
  keys: readonly string[]
  scopes: readonly Scope[]
  kind: 'hold' | 'press'
}
const hold = (label: string, keys: string[], scopes: Scope[]): Binding => ({
  label,
  keys,
  scopes,
  kind: 'hold',
})
const press = (label: string, keys: string[], scopes: Scope[]): Binding => ({
  label,
  keys,
  scopes,
  kind: 'press',
})
/** Context-specific bindings precede their general fallback. No key is duplicated within a scope. */
export const inputBindings = {
  'menu.up': press('Opción anterior', ['ArrowUp'], ['menu']),
  'menu.down': press('Opción siguiente', ['ArrowDown'], ['menu']),
  'menu.accept': press('Aceptar', ['Enter'], ['menu']),
  'menu.back': press('Volver', ['Escape'], ['menu']),
  'lean.left': hold('Asomarse a la izquierda', ['KeyQ'], ['aim']),
  'lean.right': hold('Asomarse a la derecha', ['KeyE'], ['aim']),
  'weapon.magazine': press('Extraer / insertar cargador', ['KeyR'], ['weapon']),
  'weapon.slide': press('Accionar corredera', ['KeyF'], ['weapon']),
  'weapon.inspect': hold('Inspeccionar; clic izquierdo cambia seguro', ['KeyZ'], ['weapon']),
  'weapon.chamber': hold('Inspeccionar recámara', ['KeyX'], ['weapon']),
  'weapon.laser': press('Láser', ['KeyG'], ['weapon']),
  'weapon.light': press('Linterna', ['KeyH'], ['weapon']),
  'weapon.auto': press('Automático experimental', ['KeyM'], ['weapon.walk']),
  'forklift.liftUp': hold('Subir horquillas', ['KeyI'], ['forklift']),
  'forklift.liftDown': hold('Bajar horquillas', ['KeyK'], ['forklift']),
  'forklift.tiltUp': hold('Inclinar mástil', ['KeyJ'], ['forklift']),
  'forklift.tiltDown': hold('Inclinar mástil al contrario', ['KeyL'], ['forklift']),
  'forklift.sideRight': hold('Desplazar horquillas a la derecha', ['KeyO'], ['forklift']),
  'forklift.sideLeft': hold('Desplazar horquillas a la izquierda', ['KeyU'], ['forklift']),
  'move.forward': hold(
    'Avanzar / acelerar',
    ['KeyW', 'ArrowUp'],
    ['walk', 'road', 'bike', 'forklift'],
  ),
  'move.back': hold(
    'Retroceder / freno trasero en moto',
    ['KeyS', 'ArrowDown'],
    ['walk', 'road', 'bike', 'forklift'],
  ),
  'move.right': hold('Derecha', ['KeyD', 'ArrowRight'], ['walk', 'road', 'bike', 'forklift']),
  'move.left': hold('Izquierda', ['KeyA', 'ArrowLeft'], ['walk', 'road', 'bike', 'forklift']),
  'flight.forward': hold('Cabeceo adelante / bajar morro', ['ArrowUp'], ['flight']),
  'flight.back': hold('Cabeceo atrás / levantar morro', ['ArrowDown'], ['flight']),
  'flight.right': hold('Alabeo a la derecha', ['ArrowRight'], ['flight']),
  'flight.left': hold('Alabeo a la izquierda', ['ArrowLeft'], ['flight']),
  'flight.liftUp': hold('Empuje en avión / ascender en nave', ['KeyW'], ['flight']),
  'flight.liftDown': hold('Retirar empuje / descender en nave', ['KeyS'], ['flight']),
  'flight.turnRight': hold('Girar rumbo a la derecha', ['KeyD'], ['flight']),
  'flight.turnLeft': hold('Girar rumbo a la izquierda', ['KeyA'], ['flight']),
  sprint: hold(
    'Correr / salida fuerte; gas y freno delantero completos en moto',
    ['ShiftLeft', 'ShiftRight'],
    ['game', 'viewer'],
  ),
  brake: hold('Freno de mano; freno delantero en moto', ['Space'], ['vehicle']),
  'rider.left': hold('Peso del piloto a la izquierda', ['KeyU'], ['bike']),
  'rider.right': hold('Peso del piloto a la derecha', ['KeyO'], ['bike']),
  'rider.forward': hold('Peso sobre el depósito', ['KeyI'], ['bike']),
  'rider.back': hold('Peso del piloto atrás', ['KeyL'], ['bike']),
  interact: press('Interactuar / entrar / salir / recoger', ['KeyE'], ['game']),
  headlamp: press('Linterna', ['KeyT'], ['walk']),
  camera: press('Cambiar cámara', ['KeyV'], ['game']),
  stance: press('Postura a pie / tierra-vuelo en nave', ['KeyC'], ['game']),
  jump: press('Saltar / levantar moto cercana', ['Space'], ['walk']),
  hitch: press('Acoplar / desacoplar', ['KeyF'], ['vehicle']),
  helm: press('Modo de gobierno de nave', ['KeyM'], ['vehicle']),
  transmission: press('Automático / Normal-Bestia', ['KeyB'], ['vehicle']),
  recover: press('Recuperar vehículo', ['KeyR'], ['game']),
  'gear.selectR': press('Cambio H · Marcha atrás', [], ['vehicle']),
  'gear.selectN': press('Cambio H · Punto muerto', [], ['vehicle']),
  'gear.select1': press('Cambio H · Marcha 1', [], ['vehicle']),
  'gear.select2': press('Cambio H · Marcha 2', [], ['vehicle']),
  'gear.select3': press('Cambio H · Marcha 3', [], ['vehicle']),
  'gear.select4': press('Cambio H · Marcha 4', [], ['vehicle']),
  'gear.select5': press('Cambio H · Marcha 5', [], ['vehicle']),
  'gear.select6': press('Cambio H · Marcha 6', [], ['vehicle']),
  'gear.select7': press('Cambio H · Marcha 7', [], ['vehicle']),
  'gear.select8': press('Cambio H · Marcha 8', [], ['vehicle']),
  'gear.up': press('Subir marcha', ['PageUp'], ['vehicle']),
  'gear.down': press('Bajar marcha', ['PageDown'], ['vehicle']),
  transfer: press('Transferir puesto de conducción', ['KeyT'], ['vehicle']),
  holster: press('Sacar / enfundar arma', ['Tab'], ['game']),
  'gallery.reset': press('Reiniciar galería de tiro', ['KeyN'], ['game']),
  'signal.left': press('Intermitente izquierdo', ['KeyZ'], ['vehicle']),
  'signal.right': press('Intermitente derecho', ['KeyX'], ['vehicle']),
  lights: press('Luces del vehículo', ['KeyH'], ['vehicle']),
  horn: press('Claxon', [], ['vehicle']),
  gps: press('GPS', ['KeyG'], ['vehicle']),
  highBeam: press('Largas / cortas', ['KeyK'], ['road', 'bike', 'flight']),
  'vehicle.menu': press('Menú del vehículo', ['KeyJ'], ['road', 'bike', 'flight']),
  'forklift.menu': press('Menú del toro', ['KeyP'], ['forklift']),
  'xr.menu': press('Monitor XR', [], ['game']),
  'debug.wheels': press('Diagnóstico de ruedas', ['F9'], ['game']),
  'pointer.release': press('Liberar ratón', ['Escape'], ['game']),
  'viewer.forward': hold('Avanzar visor', ['KeyW'], ['viewer']),
  'viewer.back': hold('Retroceder visor', ['KeyS'], ['viewer']),
  'viewer.right': hold('Derecha visor', ['KeyD'], ['viewer']),
  'viewer.left': hold('Izquierda visor', ['KeyA'], ['viewer']),
  'viewer.up': hold('Subir visor', ['KeyE'], ['viewer']),
  'viewer.down': hold('Bajar visor', ['KeyQ'], ['viewer']),
  'launcher.first': press('Primera pestaña', ['Home'], ['launcher']),
  'launcher.last': press('Última pestaña', ['End'], ['launcher']),
  'launcher.previous': press('Pestaña anterior', ['ArrowLeft'], ['launcher']),
  'launcher.next': press('Pestaña siguiente', ['ArrowRight'], ['launcher']),
} as const
export type InputAction = keyof typeof inputBindings
const gameModes: readonly InputMode[] = ['walk', 'road', 'bike', 'forklift', 'flight']
function scopes(context: InputContext): Scope[] {
  if (context.menu) return ['menu']
  return [
    ...(context.aiming && context.weapon && context.mode === 'walk' ? ['aim' as const] : []),
    ...(context.weapon && context.mode === 'walk' ? ['weapon.walk' as const] : []),
    ...(context.weapon ? ['weapon' as const] : []),
    context.mode,
    ...(gameModes.includes(context.mode) && context.mode !== 'walk' ? ['vehicle' as const] : []),
    ...(gameModes.includes(context.mode) ? ['game' as const] : []),
  ]
}
const scopedBindings = new Map<Scope, Map<string, InputAction>>()
for (const [id, binding] of Object.entries(inputBindings)) {
  for (const scope of binding.scopes) {
    let keys = scopedBindings.get(scope)
    if (!keys) scopedBindings.set(scope, (keys = new Map()))
    for (const code of binding.keys) {
      if (keys.has(code)) throw new Error(`Input conflict: ${scope}/${code}`)
      keys.set(code, id as InputAction)
    }
  }
  Object.freeze(binding.keys)
  Object.freeze(binding.scopes)
  Object.freeze(binding)
}
Object.freeze(inputBindings)
/** Resolve holds as well as presses, so a held contextual control can consume a fallback action. */
export function bindingForKey(code: string, context: InputContext): InputAction | undefined {
  for (const scope of scopes(context)) {
    const id = scopedBindings.get(scope)?.get(code)
    if (id) return id
  }
  // The menu's own toggle remains available while gameplay holds are blocked.
  if (context.menu) {
    const toggle = scopedBindings.get(context.mode)?.get(code)
    if (toggle === 'vehicle.menu' || toggle === 'forklift.menu') return toggle
  }
  return undefined
}
export function keyboardAction(code: string, context: InputContext): InputAction | undefined {
  const id = bindingForKey(code, context)
  return id && inputBindings[id].kind === 'press' ? id : undefined
}
export function actionHeld(
  keys: ReadonlySet<string>,
  action: InputAction,
  context: InputContext,
): boolean {
  return inputBindings[action].keys.some(
    (code) => keys.has(code) && bindingForKey(code, context) === action,
  )
}
export function actionAxis(
  keys: ReadonlySet<string>,
  positive: InputAction,
  negative: InputAction,
  context: InputContext,
): number {
  return Number(actionHeld(keys, positive, context)) - Number(actionHeld(keys, negative, context))
}
/** Translate standard device buttons through the same context overrides without inventing keyboard events. */
export function contextualAction(action: InputAction, context: InputContext): InputAction {
  if (!context.weapon) return action
  const overrides: Partial<Record<InputAction, InputAction>> = {
    recover: 'weapon.magazine',
    hitch: 'weapon.slide',
    'signal.left': 'weapon.inspect',
    'signal.right': 'weapon.chamber',
    gps: 'weapon.laser',
    lights: 'weapon.light',
    ...(context.mode === 'walk' ? { helm: 'weapon.auto' as const } : {}),
  }
  return overrides[action] ?? action
}
/** Compatibility adapter for existing hosts; new hosts should pass semantic action IDs. */
/** Semantic adapters may bind actions with no default keyboard shortcut. */
export function inputActionAvailable(action: InputAction, context: InputContext): boolean {
  return (inputBindings[action].scopes as readonly Scope[]).some((scope) =>
    scopes(context).includes(scope),
  )
}
export function legacyInputAction(value: string): InputAction | undefined {
  if (Object.hasOwn(inputBindings, value)) return value as InputAction
  // No active weapon/menu: preserve the historical public game.action(KeyE) contract.
  return keyboardAction(value, { mode: value === 'Space' ? 'walk' : 'road' })
}
export function keyLabel(code: string): string {
  const special: Record<string, string> = {
    Space: 'Espacio',
    Tab: 'Tab',
    Escape: 'Esc',
    Enter: 'Enter',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
  }
  return special[code] ?? code.replace(/^Key/, '')
}
/** The same resolved declarations drive help; hidden fallback actions never appear as available. */
export function controlsFor(
  context: InputContext,
): { action: InputAction; label: string; keys: string[]; kind: Binding['kind'] }[] {
  return (Object.entries(inputBindings) as [InputAction, Binding][]).flatMap(
    ([action, binding]) => {
      const keys = binding.keys.filter((code) => bindingForKey(code, context) === action)
      return keys.length ? [{ action, label: binding.label, keys, kind: binding.kind }] : []
    },
  )
}
export function controlsHint(context: InputContext, actions?: readonly InputAction[]): string {
  return controlsFor(context)
    .filter((binding) => !actions || actions.includes(binding.action))
    .map((binding) => `${[...new Set(binding.keys.map(keyLabel))].join('/')} ${binding.label}`)
    .join(' · ')
}
/** Generic XR and gamepad adapters share semantic actions; their button numbers remain device-specific. */
export const xrActionButtons = [
  ['right', 4, 'interact'],
  ['right', 5, 'jump'],
  ['left', 4, 'xr.menu'],
  ['right', 3, 'holster'],
  ['left', 3, 'stance'],
  ['left', 5, 'recover'],
] as const
export const gamepadActionButtons = [
  [0, 'interact'],
  [1, 'camera'],
  [2, 'hitch'],
  [3, 'stance'],
  [4, 'recover'],
] as const

/** Chords are expressed in actions, so their aliases follow the same declarations. */
export const inputChords = {
  prone: ['stance', 'jump'],
  launch: ['move.forward', 'move.back'],
} as const satisfies Record<string, readonly InputAction[]>
export function actionChordHeld(
  keys: ReadonlySet<string>,
  chord: keyof typeof inputChords,
  context: InputContext,
): boolean {
  return inputChords[chord].every((action) => actionHeld(keys, action, context))
}
/** Watch only driving/walking keys for lost-keyup recovery, preserving modifier semantics. */
export const movementKeyCodes: ReadonlySet<string> = new Set(
  (['move.forward', 'move.back', 'move.right', 'move.left', 'brake'] as const).flatMap(
    (action) => inputBindings[action].keys,
  ),
)
export const mouseButtons = Object.freeze({ fire: 0, aim: 2 })

/** A press completes a chord when the other declared actions are already held. */
export function actionCompletesChord(
  keys: ReadonlySet<string>,
  chord: keyof typeof inputChords,
  pressed: InputAction,
  context: InputContext,
): boolean {
  const actions: readonly InputAction[] = inputChords[chord]
  return (
    actions.includes(pressed) &&
    actions.every((action) => action === pressed || actionHeld(keys, action, context))
  )
}

/** Determine the one locomotion mode shared by mixing, event routing and help. */
export function inputMode(
  seated: boolean,
  flight: boolean,
  vehicle?: { twoWheeled?: unknown; forklift?: boolean } | null,
): InputMode {
  return !seated
    ? 'walk'
    : flight
      ? 'flight'
      : vehicle?.twoWheeled
        ? 'bike'
        : vehicle?.forklift
          ? 'forklift'
          : 'road'
}

/** Keyboard intents for HTML tab lists and focus containment; independent of gameplay actions. */
export function menuNavigationKey(
  code: string,
): 'previous' | 'next' | 'first' | 'last' | 'focus' | undefined {
  switch (code) {
    case 'ArrowLeft':
      return 'previous'
    case 'ArrowRight':
      return 'next'
    case 'Home':
      return 'first'
    case 'End':
      return 'last'
    case 'Tab':
      return 'focus'
    default:
      return undefined
  }
}
