import { prefetchPrepared } from './prepared-world.js'
import type { GeoPoint } from '../src/geography.js'
// One speculative request, isolated from generation of immediately needed meshes.
let wanted: string[] = [],
  origin: GeoPoint | undefined,
  identity = '',
  busy = false
let active: { key: string; controller: AbortController } | undefined
const retryAt = new Map<string, number>()
self.onmessage = (event: MessageEvent<{ origin: GeoPoint; keys: string[] }>) => {
  const next = JSON.stringify(event.data.origin)
  if (identity !== next) {
    active?.controller.abort()
    retryAt.clear()
    identity = next
  }
  origin = event.data.origin
  wanted = event.data.keys.slice(0, 24)
  if (active && !wanted.includes(active.key)) active.controller.abort()
  void pump()
}
async function pump() {
  if (busy || !origin) return
  const key = wanted.find((key) => Date.now() >= (retryAt.get(key) ?? 0))
  if (!key) return
  const controller = new AbortController(),
    requestIdentity = identity
  active = { key, controller }
  busy = true
  try {
    const found = await prefetchPrepared(origin, key, controller.signal)
    if (!controller.signal.aborted && requestIdentity === identity)
      retryAt.set(key, Date.now() + (found ? 300_000 : 60_000))
  } catch {
    if (!controller.signal.aborted && requestIdentity === identity)
      retryAt.set(key, Date.now() + 60_000)
  } finally {
    active = undefined
    busy = false
    // Bound bookkeeping even during very long flights.
    for (const key of retryAt.keys()) if (!wanted.includes(key)) retryAt.delete(key)
    void pump()
  }
}
setInterval(() => void pump(), 5000)
