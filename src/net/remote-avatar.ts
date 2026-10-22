import {
  SnapshotBuffer,
  avatarSampleOps,
  defaultInterpolation,
  type InterpolationOptions,
} from './interpolation.js'
import type { AvatarSample, PeerInfo } from './protocol.js'

/**
 * What the game shows for one remote on-foot player. The network layer only hands it
 * interpolated samples; drawing, animation names and scene placement are the game's.
 */
export interface RemoteAvatarView {
  /** Show the body at `sample` (interpolated) and advance its animation by `dt` seconds. */
  update(sample: AvatarSample, dt: number): void
  /** Show or hide the body (hidden while no fresh samples arrive, e.g. the peer drives). */
  setVisible?(visible: boolean): void
  dispose(): void
}

/** Game hook: make the view of a peer's body (may load assets first); null skips the peer. */
export type RemoteAvatarFactory = (
  peer: PeerInfo,
) => RemoteAvatarView | null | Promise<RemoteAvatarView | null>

/** Without avatar samples for this long (ms) the body is hidden (the peer stopped sending it). */
export const AVATAR_STALE_MS = 1000

/**
 * One remote peer's on-foot body: the same jitter buffer as vehicles (default 100 ms behind,
 * at most 250 ms extrapolation), with yaw on the shortest arc.
 */
export class RemoteAvatar {
  readonly buffer: SnapshotBuffer<AvatarSample>
  /** Null while the factory is still building it. */
  view: RemoteAvatarView | null = null
  private lastFrame: number | null = null
  private lastReceived = -Infinity
  private visible: boolean | null = null
  private disposed = false

  constructor(options: InterpolationOptions = defaultInterpolation) {
    this.buffer = new SnapshotBuffer(options, avatarSampleOps)
  }

  push(t: number, sample: AvatarSample, receivedAt: number): void {
    this.buffer.push({ t, state: sample }, receivedAt)
    this.lastReceived = receivedAt
  }

  /**
   * Hand over the view once built; a view arriving after {@link dispose} is disposed, and a new
   * view (rebuilt body) replaces and disposes the previous one, keeping the sample buffer.
   */
  attach(view: RemoteAvatarView | null): void {
    if (this.disposed) {
      view?.dispose()
      return
    }
    if (this.view && this.view !== view) this.view.dispose()
    this.view = view
    this.visible = null
  }

  /** Call once per frame; returns the sample shown, or null when hidden or not ready. */
  update(now: number): AvatarSample | null {
    const dt = this.lastFrame === null ? 0 : Math.max(0, (now - this.lastFrame) / 1000)
    this.lastFrame = now
    const view = this.view
    if (!view) return null
    const fresh = now - this.lastReceived <= AVATAR_STALE_MS
    if (fresh !== this.visible) {
      view.setVisible?.(fresh)
      this.visible = fresh
    }
    if (!fresh) return null
    const sample = this.buffer.sample(now)
    if (!sample) return null
    view.update(sample, dt)
    return sample
  }

  dispose(): void {
    this.disposed = true
    this.view?.dispose()
    this.view = null
  }
}
