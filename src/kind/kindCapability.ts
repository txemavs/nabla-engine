/**
 * EntityKind class contract on the wire. Dispatch Go / Drive / Fly / E
 * from these names — not from GLB sniff or ``world.car.*``.
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/kind/kindCapability.ts
 */
import type { StageMeshRef } from './types.js'

export const CAPABILITY_DRIVE = 'drive'
export const CAPABILITY_FLY = 'fly'
export const CAPABILITY_PORTAL = 'portal'
export const CAPABILITY_SIT = 'sit'
export const CAPABILITY_SENSE = 'sense'
export const CAPABILITY_INFER = 'infer'

export const KIND_CAPABILITIES = [
  CAPABILITY_DRIVE,
  CAPABILITY_FLY,
  CAPABILITY_PORTAL,
  CAPABILITY_SIT,
  CAPABILITY_SENSE,
  CAPABILITY_INFER,
] as const

export type KindCapability = (typeof KIND_CAPABILITIES)[number]

export const ADAPTER_NONE = 'none'
export const ADAPTER_CANNON = 'cannon'
export const ADAPTER_ISAAC = 'isaac'
export const ADAPTER_ONNX = 'onnx'

export type KindContract = {
  capabilities?: string[]
  adapter?: string
  pads?: string[]
  tools?: string[]
  kind_namespace?: string
}

export function normalizeNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    const s = String(item ?? '').trim().toLowerCase()
    if (!s || !/^[a-z][a-z0-9_.]*$/.test(s)) continue
    if (!out.includes(s)) out.push(s)
  }
  return out
}

export function hasCapability(row: KindContract | null | undefined, cap: string): boolean {
  return normalizeNames(row?.capabilities).includes(cap)
}

export function kindPadWindow(row: KindContract | null | undefined): string | null {
  const pads = normalizeNames(row?.pads)
  if (pads.includes('betaflight')) return 'betaflight'
  if (pads.includes('drive')) return 'drive'
  if (hasCapability(row, CAPABILITY_FLY)) return 'betaflight'
  if (hasCapability(row, CAPABILITY_DRIVE)) return 'drive'
  return null
}

const HULL_NS = new Set(['entity.system.ship.home', 'entity.system.container.5x10'])

/** Sit + drive, or a shipped hull class. Reach / 1P cabin / fleet ship. */
export function isHullClass(row: KindContract | null | undefined): boolean {
  if (HULL_NS.has(row?.kind_namespace || '')) return true
  return hasCapability(row, CAPABILITY_SIT) && hasCapability(row, CAPABILITY_DRIVE)
}

function meshKey(mesh: StageMeshRef): string {
  if ('url' in mesh && mesh.url) return `url:${mesh.url}`
  if ('builtin' in mesh && mesh.builtin) return `builtin:${mesh.builtin}`
  if ('hi_res' in mesh && mesh.hi_res) return `hi:${mesh.hi_res}`
  return ''
}

/** Match a paint mesh to a catalog kind. Skip shared builtins (none / example). */
export function kindMatchingMesh<T extends { mesh: StageMeshRef; namespace?: string }>(
  mesh: StageMeshRef,
  kinds: T[],
): T | undefined {
  const key = meshKey(mesh)
  if (!key || key === 'builtin:none' || key === 'builtin:example') return undefined
  const hits = kinds.filter((k) => meshKey(k.mesh) === key)
  if (hits.length === 1) return hits[0]
  if (hits.length > 1) {
    return hits.find((k) => !(k.namespace || '').includes('.portal.nabla')) ?? hits[0]
  }
  return undefined
}
