/**
 * Skinned player body: one shared rig (mesh + animation clips, loaded once) and one
 * {@link PlayerBody} per player, local or remote. A body is driven only by an
 * {@link AvatarNetState} ({@link AVATAR_ANIM_STATES} name, yaw, position, speed), so the
 * local player and remote players run the same code: the local one derives its state from the
 * simulation ({@link localAvatarState}); a remote one gets it from the network.
 *
 * Asset contract: glTF, metres, Y-up, facing +Z, feet at y = 0, clips named as the states,
 * no root motion (the game moves the object). An `Object3D` with
 * `userData.nabla_attach === 'createMonitorAvatar'` is the head socket. Optional named sockets:
 * `WeaponSocket_R` (held weapon: −Z barrel, +Y top; the weapon's `GripSocket` lands on it) and
 * any socket an {@link PlayerBodyAttachment} names (belt, holster, baton…). Materials may carry
 * `extras.nabla_color_slot` (`primary` / `secondary` / `tertiary` / `light`) for
 * {@link PlayerBodyAssets.colors}.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { MeshoptDecoder } from 'meshoptimizer'
import type { Vec3Tuple } from '../../entity/schema.js'

/** Animation states of a body; each is the name of a clip in the animations file. */
export const AVATAR_ANIM_STATES = [
  'idle',
  'walk',
  'run',
  'jump_start',
  'jump_loop',
  'jump_land',
  'crouch_idle',
  'crouch_walk',
  'sit',
  'drive',
] as const
export type AvatarAnimState = (typeof AVATAR_ANIM_STATES)[number]

/**
 * Everything another client needs to draw a player's body (network contract): the
 * animation state, the heading (gameplay radians, 0 faces −Z), the feet position in local
 * metres and the horizontal speed in m/s (it sets the stride rate).
 */
export interface AvatarNetState {
  animState: AvatarAnimState
  yaw: number
  position: Vec3Tuple
  speed: number
}

/** Where the rig files are: the skinned mesh and the clips (may be the same file). */
export interface PlayerBodyAssets {
  model: string
  animations: string
  /** Static parts hung at sockets, in order (a later part may use a socket of an earlier one). */
  attachments?: readonly PlayerBodyAttachment[]
  /** Colour overrides per material colour slot; unset slots keep the authored colour. */
  colors?: Partial<Record<PlayerBodyColorSlot, THREE.ColorRepresentation>>
}

/** A static glTF part (belt, holster, holstered pistol…) attached at a named socket. */
export interface PlayerBodyAttachment {
  model: string
  /** Name of the socket node in the body or in an earlier attachment. */
  socket: string
  /**
   * `holstered`: the weapon shown on the body while no weapon is drawn
   * ({@link PlayerBody.setHolstered}). Its `GripSocket`, if any, is ignored: the root sits at
   * the socket.
   */
  role?: 'holstered'
}

export const PLAYER_BODY_COLOR_SLOTS = ['primary', 'secondary', 'tertiary', 'light'] as const
export type PlayerBodyColorSlot = (typeof PLAYER_BODY_COLOR_SLOTS)[number]
/** Socket the held weapon's `GripSocket` is placed on. */
export const WEAPON_SOCKET = 'WeaponSocket_R'
const HOLSTERED = 'nabla_holstered'

/** Speeds the clips were authored for, m/s: their playback rate follows the real speed. */
export const AVATAR_STRIDE_SPEED = { walk: 1.4, run: 3.5, crouch_walk: 0.8 } as const
/** Above this horizontal speed a player walks (or crouch-walks). */
const MOVING = 0.25
const LOOPING = new Set<AvatarAnimState>([
  'idle',
  'walk',
  'run',
  'jump_loop',
  'crouch_idle',
  'crouch_walk',
  'sit',
  'drive',
])
const FADE = 0.25

/** What the local simulation says about the player, for {@link localAvatarState}. */
export interface AvatarInput {
  grounded: boolean
  /** Upward speed, m/s. */
  rising: number
  /** Horizontal speed, m/s. */
  speed: number
  crouching: boolean
  seated: boolean
  /**
   * Speed above which a standing player runs, m/s: the host passes the midpoint of its walk and
   * sprint speeds, so normal walking plays `walk` and only sprinting plays `run`.
   */
  runAbove: number
}

/**
 * Next animation state from the player's movement. Pure, so the same rules hold wherever the
 * state is computed. `previous` keeps the jump phases in order (start → loop → land).
 */
export function localAvatarState(previous: AvatarAnimState, input: AvatarInput): AvatarAnimState {
  if (input.seated) return 'drive'
  if (!input.grounded)
    return previous === 'jump_start' || input.rising > 0.5 ? 'jump_start' : 'jump_loop'
  if (previous === 'jump_start' || previous === 'jump_loop') return 'jump_land'
  if (input.crouching) return input.speed > MOVING ? 'crouch_walk' : 'crouch_idle'
  if (input.speed > input.runAbove) return 'run'
  if (input.speed > MOVING) return 'walk'
  return 'idle'
}

/** The shared rig: one load of the mesh and clips for every body. */
export class PlayerBodyRig {
  private constructor(
    private readonly source: THREE.Object3D,
    readonly clips: readonly THREE.AnimationClip[],
  ) {}
  static async load(assets: PlayerBodyAssets): Promise<PlayerBodyRig> {
    await MeshoptDecoder.ready
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
    const parts = assets.attachments ?? []
    const [model, animations, ...loaded] = await Promise.all([
      loader.loadAsync(assets.model),
      assets.animations === assets.model ? null : loader.loadAsync(assets.animations),
      ...parts.map((part) => loader.loadAsync(part.model)),
    ])
    const source = model.scene
    parts.forEach((part, index) => {
      const socket = source.getObjectByName(part.socket)
      if (!socket) {
        console.warn(`player body: no socket ${part.socket} for ${part.model}`)
        return
      }
      const scene = loaded[index].scene
      scene.name =
        part.model
          .split('/')
          .pop()
          ?.replace(/\.glb$/, '') ?? 'attachment'
      if (part.role === 'holstered') scene.userData[HOLSTERED] = true
      socket.add(scene)
    })
    if (assets.colors) recolor(source, assets.colors)
    return new PlayerBodyRig(source, (animations ?? model).animations)
  }
  /** A new body sharing this rig's geometry, materials and clips. */
  create(): PlayerBody {
    return new PlayerBody(cloneSkinned(this.source), this.clips)
  }
}

function recolor(root: THREE.Object3D, colors: NonNullable<PlayerBodyAssets['colors']>): void {
  const done = new Map<THREE.Material, THREE.Material>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return
    const swap = (material: THREE.Material): THREE.Material => {
      const slot = material.userData?.nabla_color_slot as PlayerBodyColorSlot | undefined
      const color = slot ? colors[slot] : undefined
      if (color === undefined || !('color' in material)) return material
      let copy = done.get(material)
      if (!copy) {
        copy = material.clone()
        ;(copy as THREE.MeshStandardMaterial).color.set(color)
        done.set(material, copy)
      }
      return copy
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material)
  })
}

const scratch = new THREE.Matrix4()
const gripInverse = new THREE.Matrix4()

/** One player's body: its own skeleton and mixer over the shared rig. */
export class PlayerBody {
  /** Feet origin; facing −Z at yaw 0 like every game object. */
  readonly root = new THREE.Group()
  /** The head socket, or null when the asset has none. */
  readonly head: THREE.Object3D | null
  /** Where a held weapon's grip goes ({@link WEAPON_SOCKET}), or null. */
  readonly weaponSocket: THREE.Object3D | null
  private readonly holstered: THREE.Object3D[] = []
  private readonly mixer: THREE.AnimationMixer
  private readonly actions = new Map<AvatarAnimState, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null
  private currentState: AvatarAnimState | null = null

  constructor(model: THREE.Object3D, clips: readonly THREE.AnimationClip[]) {
    this.root.name = 'player-body'
    // glTF faces +Z; game objects face −Z.
    model.rotation.y = Math.PI
    this.root.add(model)
    let head: THREE.Object3D | null = null
    model.traverse((object) => {
      if (object.userData.nabla_attach === 'createMonitorAvatar') head = object
      if (object.userData[HOLSTERED]) this.holstered.push(object)
      if ((object as THREE.Mesh).isMesh) object.frustumCulled = false
    })
    this.head = head
    this.weaponSocket = model.getObjectByName(WEAPON_SOCKET) ?? null
    this.mixer = new THREE.AnimationMixer(model)
    for (const state of AVATAR_ANIM_STATES) {
      const clip = THREE.AnimationClip.findByName(clips as THREE.AnimationClip[], state)
      if (!clip) continue
      const action = this.mixer.clipAction(clip)
      if (!LOOPING.has(state)) {
        action.setLoop(THREE.LoopOnce, 1)
        action.clampWhenFinished = true
      }
      this.actions.set(state, action)
    }
  }

  /** The state being shown (after a one-shot ends this is what follows it). */
  get state(): AvatarAnimState | null {
    return this.currentState
  }

  /** True when the one-shot clip of the current state has finished. */
  get finished(): boolean {
    const action = this.current
    return !!action && action.loop === THREE.LoopOnce && !action.isRunning()
  }

  /** Show `state` at `speed` (m/s, sets the stride rate) and advance the clips by `dt`. */
  animate(state: AvatarAnimState, speed: number, dt: number): void {
    const next = this.actions.get(state) ?? this.actions.get('idle')
    if (next && next !== this.current) {
      next.reset().play()
      if (this.current) next.crossFadeFrom(this.current, FADE, true)
      this.current = next
    }
    this.currentState = state
    const stride = AVATAR_STRIDE_SPEED[state as keyof typeof AVATAR_STRIDE_SPEED]
    if (next) next.timeScale = stride ? THREE.MathUtils.clamp(speed / stride, 0.5, 3) : 1
    this.mixer.update(Math.min(Math.max(dt, 0), 0.1))
  }

  /** Remote players: place and animate from a network state. */
  apply(state: AvatarNetState, dt: number): void {
    this.root.position.fromArray(state.position)
    this.root.rotation.set(0, state.yaw, 0)
    this.animate(state.animState, state.speed, dt)
  }

  /** Head socket position in `frame`'s local space (after the last {@link animate}). */
  headIn(frame: THREE.Object3D, target = new THREE.Vector3()): THREE.Vector3 | null {
    if (!this.head) return null
    this.root.updateWorldMatrix(true, true)
    return frame.worldToLocal(this.head.getWorldPosition(target))
  }

  /** True when the body has a holstered weapon part. */
  get hasHolster(): boolean {
    return this.holstered.length > 0
  }

  /** Show or hide the holstered weapon (hide it while the player holds a weapon). */
  setHolstered(visible: boolean): void {
    for (const object of this.holstered) object.visible = visible
  }

  /**
   * Move `weapon` (already in the scene graph) so its `GripSocket` (or its origin when it has
   * none) sits on the hand's weapon socket. Call after {@link animate}. False without a socket.
   * `keepOrientation`: only move it (the caller already aimed it); else take the socket's turn.
   */
  holdAtHand(weapon: THREE.Object3D, keepOrientation = false): boolean {
    const socket = this.weaponSocket
    const parent = weapon.parent
    if (!socket || !parent) return false
    this.root.updateWorldMatrix(true, true)
    weapon.updateWorldMatrix(true, true)
    const grip = weapon.getObjectByName('GripSocket')
    if (keepOrientation) {
      const target = socket.getWorldPosition(new THREE.Vector3())
      const at = grip && grip !== weapon ? grip.getWorldPosition(new THREE.Vector3()) : null
      const from = at ?? weapon.getWorldPosition(new THREE.Vector3())
      const delta = parent.worldToLocal(target.clone()).sub(parent.worldToLocal(from))
      weapon.position.add(delta)
      weapon.updateMatrixWorld(true)
      return true
    }
    gripInverse.identity()
    if (grip && grip !== weapon)
      gripInverse.copy(weapon.matrixWorld).invert().multiply(grip.matrixWorld).invert()
    scratch
      .copy(parent.matrixWorld)
      .invert()
      .multiply(socket.matrixWorld)
      .multiply(gripInverse)
      .decompose(weapon.position, weapon.quaternion, weapon.scale)
    weapon.updateMatrixWorld(true)
    return true
  }

  dispose(): void {
    this.mixer.stopAllAction()
    this.root.removeFromParent()
  }
}
