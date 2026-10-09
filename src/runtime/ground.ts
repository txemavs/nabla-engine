import type { Vec3Tuple } from '../entity/schema.js'
import { streamingDefaults } from '../config/streaming.js'
import { mapTileId, type MapTile } from '../scene/mercator.js'

/** The tile host has no tile under the position: waiting cannot help. `tile` names the missing cell. */
export class GroundMissingError extends Error {
  constructor(readonly tile: MapTile) {
    super(`Ground unavailable: the tile host has no terrain at ${mapTileId(tile)}`)
    this.name = 'GroundMissingError'
  }
}

export interface GroundProvider {
  update(position: Vec3Tuple, velocity: Vec3Tuple): void
  flushInstall(budget: number): unknown
  groundHeight(position: Vec3Tuple): number | undefined
  readonly status: string
  /** Changes whenever loading advances (a cell arrives or fails); lets the wait tell slow from stuck. */
  readonly loadProgress?: string
  /** The tile the host lacks under this position, if any: waiting cannot help. */
  missingTileAt?(position: Vec3Tuple): MapTile | undefined
}

/** GLB float32 vertices can leave sub-millimetre gaps at shared tile corners.
 * Probe only 1 mm around the same location; never substitute a plane or a distant tile.
 */
export function groundAtSeam(
  world: Pick<GroundProvider, 'groundHeight'>,
  position: Vec3Tuple,
): number | undefined {
  const height = world.groundHeight(position)
  if (height !== undefined && Number.isFinite(height)) return height
  for (const [dx, dz] of [
    [-0.001, -0.001],
    [0.001, -0.001],
    [-0.001, 0.001],
    [0.001, 0.001],
  ]) {
    const nearby = world.groundHeight([position[0] + dx, position[1], position[2] + dz])
    if (nearby !== undefined && Number.isFinite(nearby)) return nearby
  }
  return undefined
}

/** Yield until the next animation frame, or `fallbackMs` when rAF is unavailable (tests / Node). */
function waitTick(fallbackMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let raf = 0
    const finish = () => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }
    const onAbort = () => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
      reject(signal?.reason ?? new Error('Ground loading cancelled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) {
      onAbort()
      return
    }
    // Cap the wait so a backgrounded tab (rAF paused) still polls downloads.
    timer = setTimeout(finish, fallbackMs)
    if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(finish)
  })
}

/**
 * Wait for usable ground, not a fixed count of neighbouring tiles. Never starts after a timeout.
 * `timeoutMs` is a stall limit: it restarts whenever the provider reports progress (`loadProgress`),
 * so a slow link that keeps delivering cells is never reported as an error.
 *
 * While blocked (before the gameplay frame loop runs), staging uses
 * {@link streamingDefaults.blockingInstallBudgetMs} so large LiDAR cells are not drip-fed at the
 * 1.5 ms/frame gameplay budget.
 */
export async function waitForGround(
  world: GroundProvider,
  position: Vec3Tuple,
  options: {
    signal?: AbortSignal
    timeoutMs?: number
    onProgress?: (status: string) => void
    /** Override the blocking install budget (ms/tick). */
    installBudgetMs?: number
    /** Override the poll interval (ms) when rAF is unavailable. */
    pollMs?: number
  } = {},
): Promise<number> {
  const timeout = options.timeoutMs ?? 120000
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Invalid ground timeout')
  const installBudget = options.installBudgetMs ?? streamingDefaults.blockingInstallBudgetMs
  const pollMs = options.pollMs ?? streamingDefaults.blockingPollMs
  if (!Number.isFinite(installBudget) || installBudget <= 0)
    throw new Error('Invalid ground install budget')
  if (!Number.isFinite(pollMs) || pollMs <= 0) throw new Error('Invalid ground poll interval')
  let started = performance.now()
  let progress = world.loadProgress
  while (true) {
    options.signal?.throwIfAborted()
    world.update(position, [0, 0, 0])
    world.flushInstall(installBudget)
    const height = groundAtSeam(world, position)
    if (height !== undefined && Number.isFinite(height)) return height
    options.onProgress?.(world.status)
    const hole = world.missingTileAt?.(position)
    if (hole) throw new GroundMissingError(hole)
    if (world.loadProgress !== progress) {
      progress = world.loadProgress
      started = performance.now()
    }
    const remaining = timeout - (performance.now() - started)
    if (remaining <= 0) throw new Error(`Ground unavailable: ${world.status}`)
    await waitTick(Math.min(pollMs, remaining), options.signal)
  }
}

/**
 * Wait until every cell the stream plans around `position` has arrived (or failed / is a known
 * hole), e.g. the landscape seen during a start descent. `pending` adds other install queues
 * (map meshes) that must drain too. Resolves true when settled, false at the stall limit (no
 * progress for `stallMs`) or the hard cap; never throws for slowness.
 */
export async function waitForArea(
  world: GroundProvider & { readonly cellStats?: { pending: number } },
  position: Vec3Tuple,
  options: {
    signal?: AbortSignal
    stallMs?: number
    capMs?: number
    installBudgetMs?: number
    pending?: () => number
    /** Drains another install queue each tick (e.g. map meshes). */
    flush?: () => void
    onProgress?: (pending: number) => void
  } = {},
): Promise<boolean> {
  const stall = options.stallMs ?? 15000
  const cap = options.capMs ?? 60000
  const budget = options.installBudgetMs ?? streamingDefaults.blockingInstallBudgetMs
  const begun = performance.now()
  let progressAt = begun
  let progress = world.loadProgress
  let quiet = 0
  while (true) {
    options.signal?.throwIfAborted()
    world.update(position, [0, 0, 0])
    world.flushInstall(budget)
    options.flush?.()
    const pending = (world.cellStats?.pending ?? 0) + (options.pending?.() ?? 0)
    options.onProgress?.(pending)
    // Two quiet ticks in a row: a finished cell can queue map meshes on the next tick.
    quiet = pending === 0 ? quiet + 1 : 0
    if (quiet >= 2) return true
    if (world.loadProgress !== progress) {
      progress = world.loadProgress
      progressAt = performance.now()
    }
    const now = performance.now()
    if (now - progressAt > stall || now - begun > cap) return false
    await waitTick(streamingDefaults.blockingPollMs, options.signal)
  }
}
