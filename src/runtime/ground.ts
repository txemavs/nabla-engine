import type { Vec3Tuple } from '../entity/schema.js'

export interface GroundProvider {
  update(position: Vec3Tuple, velocity: Vec3Tuple): void
  flushInstall(budget: number): unknown
  groundHeight(position: Vec3Tuple): number | undefined
  readonly status: string
  /** Changes whenever loading advances (a cell arrives or fails); lets the wait tell slow from stuck. */
  readonly loadProgress?: string
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

/**
 * Wait for usable ground, not a fixed count of neighbouring tiles. Never starts after a timeout.
 * `timeoutMs` is a stall limit: it restarts whenever the provider reports progress (`loadProgress`),
 * so a slow link that keeps delivering cells is never reported as an error.
 */
export async function waitForGround(
  world: GroundProvider,
  position: Vec3Tuple,
  options: { signal?: AbortSignal; timeoutMs?: number; onProgress?: (status: string) => void } = {},
): Promise<number> {
  const timeout = options.timeoutMs ?? 120000
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Invalid ground timeout')
  let started = performance.now()
  let progress = world.loadProgress
  while (true) {
    options.signal?.throwIfAborted()
    world.update(position, [0, 0, 0])
    world.flushInstall(1.5)
    const height = groundAtSeam(world, position)
    if (height !== undefined && Number.isFinite(height)) return height
    options.onProgress?.(world.status)
    if (world.loadProgress !== progress) {
      progress = world.loadProgress
      started = performance.now()
    }
    const remaining = timeout - (performance.now() - started)
    if (remaining <= 0) throw new Error(`Ground unavailable: ${world.status}`)
    await new Promise<void>((resolve, reject) => {
      const finish = () => {
        options.signal?.removeEventListener('abort', abort)
        resolve()
      }
      const timer = setTimeout(finish, Math.min(100, remaining))
      const abort = () => {
        clearTimeout(timer)
        options.signal?.removeEventListener('abort', abort)
        reject(options.signal?.reason ?? new Error('Ground loading cancelled'))
      }
      options.signal?.addEventListener('abort', abort, { once: true })
      if (options.signal?.aborted) abort()
    })
  }
}
