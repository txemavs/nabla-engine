import { t } from '../i18n/index.js'
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
  'menu.up': press(t('input.action.menu.up'), ['ArrowUp'], ['menu']),
  'menu.down': press(t('input.action.menu.down'), ['ArrowDown'], ['menu']),
  'menu.accept': press(t('input.action.menu.accept'), ['Enter'], ['menu']),
  'menu.back': press(t('input.action.menu.back'), ['Escape'], ['menu']),
  'lean.left': hold(t('input.action.lean.left'), ['KeyU'], ['aim']),
  'lean.right': hold(t('input.action.lean.right'), ['KeyE'], ['aim']),
  'weapon.magazine': press(t('input.action.weapon.magazine'), ['KeyR'], ['weapon']),
  'weapon.slide': press(t('input.action.weapon.slide'), ['KeyF'], ['weapon']),
  'weapon.inspect': hold(t('input.action.weapon.inspect'), ['KeyZ'], ['weapon']),
  'weapon.chamber': hold(t('input.action.weapon.chamber'), ['KeyX'], ['weapon']),
  'weapon.laser': press(t('input.action.weapon.laser'), ['KeyG'], ['weapon']),
  'weapon.light': press(t('input.action.weapon.light'), ['KeyH'], ['weapon']),
  'weapon.auto': press(t('input.action.weapon.auto'), ['KeyM'], ['weapon.walk']),
  'forklift.liftUp': hold(t('input.action.forklift.liftUp'), ['KeyI'], ['forklift']),
  'forklift.liftDown': hold(t('input.action.forklift.liftDown'), ['KeyK'], ['forklift']),
  'forklift.tiltUp': hold(t('input.action.forklift.tiltUp'), ['KeyJ'], ['forklift']),
  'forklift.tiltDown': hold(t('input.action.forklift.tiltDown'), ['KeyL'], ['forklift']),
  'forklift.sideRight': hold(t('input.action.forklift.sideRight'), ['KeyO'], ['forklift']),
  'forklift.sideLeft': hold(t('input.action.forklift.sideLeft'), ['KeyU'], ['forklift']),
  'move.forward': hold(
    t('input.action.move.forward'),
    ['KeyW', 'ArrowUp'],
    ['walk', 'road', 'bike', 'forklift'],
  ),
  'move.back': hold(
    t('input.action.move.back'),
    ['KeyS', 'ArrowDown'],
    ['walk', 'road', 'bike', 'forklift'],
  ),
  'move.right': hold(t('input.action.move.right'), ['KeyD', 'ArrowRight'], ['walk', 'road', 'bike', 'forklift']),
  'move.left': hold(t('input.action.move.left'), ['KeyA', 'ArrowLeft'], ['walk', 'road', 'bike', 'forklift']),
  'flight.forward': hold(t('input.action.flight.forward'), ['ArrowUp'], ['flight']),
  'flight.back': hold(t('input.action.flight.back'), ['ArrowDown'], ['flight']),
  'flight.right': hold(t('input.action.flight.right'), ['ArrowRight'], ['flight']),
  'flight.left': hold(t('input.action.flight.left'), ['ArrowLeft'], ['flight']),
  'flight.liftUp': hold(t('input.action.flight.liftUp'), ['KeyW'], ['flight']),
  'flight.liftDown': hold(t('input.action.flight.liftDown'), ['KeyS'], ['flight']),
  'flight.turnRight': hold(t('input.action.flight.turnRight'), ['KeyD'], ['flight']),
  'flight.turnLeft': hold(t('input.action.flight.turnLeft'), ['KeyA'], ['flight']),
  sprint: hold(
    t('input.action.sprint'),
    ['ShiftLeft', 'ShiftRight'],
    ['game', 'viewer'],
  ),
  brake: hold(t('input.action.brake'), ['Space'], ['vehicle']),
  'rider.left': hold(t('input.action.rider.left'), ['KeyU'], ['bike']),
  'rider.right': hold(t('input.action.rider.right'), ['KeyO'], ['bike']),
  'rider.forward': hold(t('input.action.rider.forward'), ['KeyI'], ['bike']),
  'rider.back': hold(t('input.action.rider.back'), ['KeyL'], ['bike']),
  interact: press(t('input.action.interact'), ['KeyE'], ['game']),
  headlamp: press(t('input.action.headlamp'), ['KeyT'], ['walk']),
  camera: press(t('input.action.camera'), ['KeyV'], ['game']),
  stance: press(t('input.action.stance'), ['KeyC'], ['game']),
  jump: press(t('input.action.jump'), ['Space'], ['walk']),
  hitch: press(t('input.action.hitch'), ['KeyF'], ['vehicle']),
  helm: press(t('input.action.helm'), ['KeyM'], ['vehicle']),
  transmission: press(t('input.action.transmission'), ['KeyB'], ['vehicle']),
  recover: press(t('input.action.recover'), ['KeyY'], ['game']),
  'gear.selectR': press(t('input.action.gear.selectR'), [], ['vehicle']),
  'gear.selectN': press(t('input.action.gear.selectN'), [], ['vehicle']),
  'gear.select1': press(t('input.action.gear.select1'), [], ['vehicle']),
  'gear.select2': press(t('input.action.gear.select2'), [], ['vehicle']),
  'gear.select3': press(t('input.action.gear.select3'), [], ['vehicle']),
  'gear.select4': press(t('input.action.gear.select4'), [], ['vehicle']),
  'gear.select5': press(t('input.action.gear.select5'), [], ['vehicle']),
  'gear.select6': press(t('input.action.gear.select6'), [], ['vehicle']),
  'gear.select7': press(t('input.action.gear.select7'), [], ['vehicle']),
  'gear.select8': press(t('input.action.gear.select8'), [], ['vehicle']),
  'gear.up': press(t('input.action.gear.up'), ['PageUp'], ['vehicle']),
  'gear.down': press(t('input.action.gear.down'), ['PageDown'], ['vehicle']),
  transfer: press(t('input.action.transfer'), ['KeyT'], ['vehicle']),
  holster: press(t('input.action.holster'), ['KeyQ'], ['game']),
  'weapon.slot1': press(t('input.action.weapon.slot1'), ['Digit1'], ['walk']),
  'weapon.slot2': press(t('input.action.weapon.slot2'), ['Digit2'], ['walk']),
  'weapon.slot3': press(t('input.action.weapon.slot3'), ['Digit3'], ['walk']),
  'weapon.slot4': press(t('input.action.weapon.slot4'), ['Digit4'], ['walk']),
  // Body slots (src/character/body-slots.ts): 1–2 holsters, 3–4 back, 5–9 belt pockets,
  // R / M chest pockets; 0 drops what is in hand. On foot only: a drawn weapon keeps R / M.
  'weapon.slot5': press(t('input.action.weapon.slot5'), ['Digit5'], ['walk']),
  'weapon.slot6': press(t('input.action.weapon.slot6'), ['Digit6'], ['walk']),
  'weapon.slot7': press(t('input.action.weapon.slot7'), ['Digit7'], ['walk']),
  'weapon.slot8': press(t('input.action.weapon.slot8'), ['Digit8'], ['walk']),
  'weapon.slot9': press(t('input.action.weapon.slot9'), ['Digit9'], ['walk']),
  'weapon.slotR': press(t('input.action.weapon.slotR'), ['KeyR'], ['walk']),
  'weapon.slotM': press(t('input.action.weapon.slotM'), ['KeyM'], ['walk']),
  'item.drop': press(t('input.action.item.drop'), ['Digit0'], ['walk']),
  'gallery.reset': press(t('input.action.gallery.reset'), ['KeyN'], ['game']),
  'signal.left': press(t('input.action.signal.left'), ['KeyZ'], ['vehicle']),
  'signal.right': press(t('input.action.signal.right'), ['KeyX'], ['vehicle']),
  lights: press(t('input.action.lights'), ['KeyH'], ['vehicle']),
  horn: press(t('input.action.horn'), ['KeyR'], ['vehicle']),
  gps: press(t('input.action.gps'), ['KeyG'], ['vehicle']),
  highBeam: press(t('input.action.highBeam'), ['KeyC', 'KeyK'], ['road', 'bike', 'flight']),
  'vehicle.menu': press(t('input.action.vehicle.menu'), ['KeyJ'], ['road', 'bike', 'flight']),
  'forklift.menu': press(t('input.action.forklift.menu'), ['KeyP'], ['forklift']),
  'xr.menu': press(t('input.action.xr.menu'), [], ['game']),
  'debug.wheels': press(t('input.action.debug.wheels'), ['F9'], ['game']),
  'pointer.release': press(t('input.action.pointer.release'), ['Escape'], ['game']),
  'viewer.forward': hold(t('input.action.viewer.forward'), ['KeyW'], ['viewer']),
  'viewer.back': hold(t('input.action.viewer.back'), ['KeyS'], ['viewer']),
  'viewer.right': hold(t('input.action.viewer.right'), ['KeyD'], ['viewer']),
  'viewer.left': hold(t('input.action.viewer.left'), ['KeyA'], ['viewer']),
  'viewer.up': hold(t('input.action.viewer.up'), ['KeyE'], ['viewer']),
  'viewer.down': hold(t('input.action.viewer.down'), ['KeyQ'], ['viewer']),
  'launcher.first': press(t('input.action.launcher.first'), ['Home'], ['launcher']),
  'launcher.last': press(t('input.action.launcher.last'), ['End'], ['launcher']),
  'launcher.previous': press(t('input.action.launcher.previous'), ['ArrowLeft'], ['launcher']),
  'launcher.next': press(t('input.action.launcher.next'), ['ArrowRight'], ['launcher']),
} as const
export type InputAction = keyof typeof inputBindings
const gameModes: readonly InputMode[] = ['walk', 'road', 'bike', 'forklift', 'flight']
function scopes(context: InputContext): Scope[] {
  if (context.menu) return ['menu']
  return [
    ...(context.aiming && context.weapon && context.mode === 'walk' ? ['aim' as const] : []),
    ...(context.weapon && context.mode === 'walk' ? ['weapon.walk' as const] : []),
    // Weapon controls exist only on foot: while driving they must never shadow vehicle keys.
    ...(context.weapon && context.mode === 'walk' ? ['weapon' as const] : []),
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
  if (code === 'KeyC' && context.mode === 'flight' && !context.menu) return 'stance'
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
  // Weapon overrides apply on foot only; recover (Y) always stays recover.
  if (!context.weapon || context.mode !== 'walk') return action
  const overrides: Partial<Record<InputAction, InputAction>> = {
    hitch: 'weapon.slide',
    'signal.left': 'weapon.inspect',
    'signal.right': 'weapon.chamber',
    gps: 'weapon.laser',
    lights: 'weapon.light',
    helm: 'weapon.auto',
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
  return keyboardAction(value, { mode: value === 'Space' || value === 'KeyC' ? 'walk' : 'road' })
}
export function keyLabel(code: string): string {
  const special: Record<string, string> = {
    Space: t('input.key.space'),
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
  return special[code] ?? code.replace(/^(Key|Digit)/, '')
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
/** Free map-inspection camera keys (Home toggles it); WASD/arrows move, Shift boosts, E/Q rise and sink. */
export const inspectorKeys = Object.freeze({
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  right: ['KeyD', 'ArrowRight'],
  left: ['KeyA', 'ArrowLeft'],
  boost: ['ShiftLeft', 'ShiftRight'],
  up: ['KeyE', 'PageUp'],
  down: ['KeyQ', 'PageDown'],
} as const)

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
