/**
 * Host hooks for the game page (game/game-page.ts). A host registers them from a module that runs
 * before game-page.ts (an earlier `<script type="module">` on the page), so it never has to patch
 * game-page.ts. Kept on a global symbol so every module copy sees the same host.
 */
import type { GameRuntime } from '@nabla/engine/runtime/browser'
import type { SceneDocument } from '@nabla/engine/scene'
import type { WorldSource } from './world-source.js'

export interface DriveHost {
  /** What the player stands on; unset, the page decides (defaultWorldSource). */
  world?: WorldSource
  /** Start on foot instead of in the page's vehicle. */
  onFoot?: boolean
  /** Overrides the flip-cinematic option. */
  flipCinematic?: boolean
  /** Edits the scene before the runtime is built. */
  prepareScene?(scene: SceneDocument): void
  /** Runs once play() has resolved. */
  /** A returned promise keeps the loading screen up until it settles (e.g. the first world GLB). */
  afterPlay?(runtime: GameRuntime): void | Promise<unknown>
}

const HOST = Symbol.for('nabla.driveHost')

export function setDriveHost(host: DriveHost): void {
  ;(globalThis as { [HOST]?: DriveHost })[HOST] = host
}

export function driveHost(): DriveHost {
  return (globalThis as { [HOST]?: DriveHost })[HOST] ?? {}
}
