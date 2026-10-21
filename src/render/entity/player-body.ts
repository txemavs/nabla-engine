/**
 * Skinned player body: one shared rig (mesh + animation clips, loaded once) and one
 * {@link PlayerBody} per player, local or remote. A body is driven only by an
 * {@link AvatarNetState} ({@link AVATAR_ANIM_STATES} name, yaw, position, speed), so the
 * local player and remote players run the same code: the local one derives its state from the
 * simulation ({@link localAvatarState}); a remote one gets it from the network.
 *
 * Asset contract: glTF, metres, Y-up, facing +Z, feet at y = 0, clips named as the states,
 * no root motion (the game moves the object). An `Object3D` with
 * `userData.nabla_attach === 'createMonitorAvatar'` is the head socket.
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
}

/** Speeds the clips were authored for, m/s: their playback rate follows the real speed. */
export const AVATAR_STRIDE_SPEED = { walk: 1.4, run: 3.5, crouch_walk: 0.8 } as const
/** Above this horizontal speed a standing player walks; above `run`, runs. */
const MOVING = 0.25
const RUNNING = 2.4
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
  if (input.speed > RUNNING) return 'run'
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
    const [model, animations] = await Promise.all([
      loader.loadAsync(assets.model),
      assets.animations === assets.model ? null : loader.loadAsync(assets.animations),
    ])
    return new PlayerBodyRig(model.scene, (animations ?? model).animations)
  }
  /** A new body sharing this rig's geometry, materials and clips. */
  create(): PlayerBody {
    return new PlayerBody(cloneSkinned(this.source), this.clips)
  }
}

/** One player's body: its own skeleton and mixer over the shared rig. */
export class PlayerBody {
  /** Feet origin; facing −Z at yaw 0 like every game object. */
  readonly root = new THREE.Group()
  /** The head socket, or null when the asset has none. */
  readonly head: THREE.Object3D | null
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
      if ((object as THREE.Mesh).isMesh) object.frustumCulled = false
    })
    this.head = head
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
    if (next) next.timeScale = stride ? THREE.MathUtils.clamp(speed / stride, 0.5, 2) : 1
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

  dispose(): void {
    this.mixer.stopAllAction()
    this.root.removeFromParent()
  }
}
