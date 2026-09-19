/**
 * Wormhole — a free-standing portal (stargate).
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/portal/wormhole.ts
 *
 * Unlike hull portals, a wormhole has no AABB or sit holes.
 * Walk through the green face (+Z → −Z) to teleport to the pair.
 */
import type { StageCamera } from '../pose.js'
import { portalLocal } from './portalGraph.js'
import { entityYawDeg } from '../world.js'

export const WORMHOLE_OPEN_W_M = 2.2
export const WORMHOLE_OPEN_H_M = 2.4
export const WORMHOLE_BAR_M = 0.1
/** Stand this far past the dest +Z so the next step does not re-cross. */
export const WORMHOLE_EXIT_M = 1.8

export type WormholePose = { x: number; y: number; z: number; yaw: number }

export interface WormholeMouth {
  id: string
  pose: WormholePose
  pairId?: string
}

export interface WormholeHost {
  id: string
  pose: WormholePose
  mesh?: { builtin?: string; url?: string }
  kind_namespace?: string
}

export function isWormholeId(id: string): boolean {
  return id.startsWith('world.wormhole.')
}

export const WORMHOLE_KIND_NS = 'entity.system.wormhole'

export function isWormholeHost(host: WormholeHost): boolean {
  if (isWormholeId(host.id)) return true
  if (host.kind_namespace === WORMHOLE_KIND_NS) return true
  const mesh = host.mesh
  return Boolean(mesh && 'builtin' in mesh && mesh.builtin === 'wormhole')
}

export function wormholeShortName(id: string): string {
  const tail = id.replace(/^world\.wormhole\./, '')
  return tail && tail !== id ? tail : id.slice(0, 8)
}

export function wormholeFaceCaption(pairId?: string): string {
  return pairId ? `→ ${wormholeShortName(pairId)}` : '→ —'
}

export function wormholeBackCaption(id: string): string {
  return wormholeShortName(id)
}

export function wrapHeading(deg: number): number {
  let d = deg % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

function yawRad(yaw: number): number {
  return (entityYawDeg(yaw) * Math.PI) / 180
}

function worldFromLocal(
  pose: { x: number; z: number; yaw: number },
  lx: number,
  lz: number,
): { x: number; z: number } {
  const yaw = yawRad(pose.yaw)
  return {
    x: pose.x + lx * Math.cos(yaw) + lz * Math.sin(yaw),
    z: pose.z - lx * Math.sin(yaw) + lz * Math.cos(yaw),
  }
}

/** Green face only: +Z → −Z. The black wall is not a door. */
export function wormholeCrossing(
  prev: { x: number; z: number },
  next: { x: number; z: number },
  pose: WormholePose,
): boolean {
  const a = portalLocal(prev, pose)
  const b = portalLocal(next, pose)
  const half = WORMHOLE_OPEN_W_M / 2 + 0.4
  if (Math.abs(a.x) > half || Math.abs(b.x) > half) return false
  return a.z > 0 && b.z <= 0
}

export interface WormholeTransit {
  x: number
  z: number
  heading: number
}

/**
 * Green in (+Z → −Z), black out. Same local X, stand on dest −Z (black).
 * Heading = rumbo + (dest yaw − from yaw) — back to the black wall.
 */
export function wormholeTransit(
  from: WormholeMouth,
  dest: WormholeMouth,
  prev: { x: number; z: number },
  next: { x: number; z: number },
  headingDeg: number,
): WormholeTransit | null {
  if (!wormholeCrossing(prev, next, from.pose)) return null
  const b = portalLocal(next, from.pose)
  const p = worldFromLocal(dest.pose, b.x, -WORMHOLE_EXIT_M)
  return {
    x: p.x,
    z: p.z,
    heading: wrapHeading(headingDeg + entityYawDeg(dest.pose.yaw) - entityYawDeg(from.pose.yaw)),
  }
}

export function wormholeArrive(
  fromId: string,
  eyeY: number,
  mouths: WormholeMouth[],
  prev: { x: number; z: number },
  next: { x: number; z: number },
  headingDeg: number,
): StageCamera | null {
  const from = mouths.find((m) => m.id === fromId)
  const destId = from?.pairId
  if (!destId) return null
  const dest = mouths.find((m) => m.id === destId)
  if (!dest) return null
  const t = wormholeTransit(from, dest, prev, next, headingDeg)
  if (!t) return null
  return { x: t.x * 1000, y: eyeY, z: t.z * 1000, rx: 8, ry: t.heading }
}

/** Build mouth list from wormhole hosts. */
export function listWormholes(
  hosts: WormholeHost[],
  destOf?: (id: string) => string | undefined,
): WormholeMouth[] {
  const raw = hosts.filter(isWormholeHost)
  const ids = new Set(raw.map((h) => h.id))
  return raw.map((h) => {
    const want = destOf?.(h.id)?.trim()
    const pairId = want && want !== h.id && ids.has(want) ? want : undefined
    return {
      id: h.id,
      pose: { x: h.pose.x, y: h.pose.y, z: h.pose.z, yaw: h.pose.yaw },
      pairId,
    }
  })
}
