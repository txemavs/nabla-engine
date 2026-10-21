/**
 * Host hooks for the drive page (game/drive.ts). A host registers them from a module that runs
 * before drive.ts (an earlier `<script type="module">` on the page), so it never has to patch
 * drive.ts. Kept on a global symbol so every module copy sees the same host.
 */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import type { SceneDocument } from '@nabla/engine/scene'

export interface DriveHost {
  /** Boot on the flat test ground without terrain, as test.html and xr.html do. */
  noTerrain?: boolean
  /** Start on foot instead of in the page's vehicle. */
  onFoot?: boolean
  /** Overrides the flip-cinematic option. */
  flipCinematic?: boolean
  /** Edits the scene before the runtime is built. */
  prepareScene?(scene: SceneDocument): void
  /** Runs once play() has resolved. */
  afterPlay?(runtime: GameRuntime): void
}

const HOST = Symbol.for('nabla.driveHost')

export function setDriveHost(host: DriveHost): void {
  ;(globalThis as { [HOST]?: DriveHost })[HOST] = host
}

export function driveHost(): DriveHost {
  return (globalThis as { [HOST]?: DriveHost })[HOST] ?? {}
}
