/**
 * OSM multipolygon relations.
 *
 * Member ways are tagged outer or inner and often arrive split. They are joined at shared
 * endpoints into closed rings. A missing member does not drop the rings that did close.
 */
import { pointInPolygon } from '../../math/planar/polygon.js'

export interface WayGeometry {
  role: string
  geometry: { lat: number; lon: number }[]
  ref: number
}

export interface AssembledRing {
  role: 'outer' | 'inner'
  coordinates: [number, number][]
}

export interface AssemblyResult {
  rings: AssembledRing[]
  incomplete: number[]
  skipped: number
}

function coordsEqual(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  tolerance = 1e-7,
): boolean {
  return Math.abs(a.lat - b.lat) < tolerance && Math.abs(a.lon - b.lon) < tolerance
}

function isClosed(geom: { lat: number; lon: number }[]): boolean {
  return geom.length >= 4 && coordsEqual(geom[0], geom[geom.length - 1])
}

/** Join member ways into closed rings. `incomplete` lists way refs that never closed. */
export function assembleMultipolygonRings(members: WayGeometry[]): AssemblyResult {
  const rings: AssembledRing[] = []
  const incomplete: number[] = []
  let skipped = 0

  const byRole = new Map<string, WayGeometry[]>()
  for (const m of members) {
    if (m.role && m.role !== 'inner' && m.role !== 'outer') {
      skipped++
      continue
    }
    const role = m.role === 'inner' ? 'inner' : 'outer'
    const list = byRole.get(role) ?? []
    list.push({ ...m, role })
    byRole.set(role, list)
  }

  for (const [role, ways] of byRole) {
    const assembled = assembleRingsForRole(ways)
    for (const ring of assembled.rings) {
      rings.push({ role: role as 'outer' | 'inner', coordinates: ring })
    }
    incomplete.push(...assembled.incomplete)
    skipped += assembled.skipped
  }

  return { rings, incomplete, skipped }
}

interface RoleAssemblyResult {
  rings: [number, number][][]
  incomplete: number[]
  skipped: number
}

function assembleRingsForRole(ways: WayGeometry[]): RoleAssemblyResult {
  const rings: [number, number][][] = []
  const incomplete: number[] = []
  let skipped = 0

  const available = new Set(ways.map((_, i) => i))

  for (const [i, way] of ways.entries()) {
    if (!available.has(i)) continue
    if (!way.geometry || way.geometry.length < 2) {
      skipped++
      available.delete(i)
      continue
    }

    if (isClosed(way.geometry)) {
      rings.push(way.geometry.map((p) => [p.lon, p.lat] as [number, number]))
      available.delete(i)
      continue
    }

    const chain = [...way.geometry]
    const chainRefs = [way.ref]
    available.delete(i)

    let extended = true
    while (extended && !isClosed(chain)) {
      extended = false

      for (const j of available) {
        const other = ways[j]
        if (!other.geometry || other.geometry.length < 2) {
          available.delete(j)
          skipped++
          continue
        }

        const chainStart = chain[0]
        const chainEnd = chain[chain.length - 1]
        const otherStart = other.geometry[0]
        const otherEnd = other.geometry[other.geometry.length - 1]

        if (coordsEqual(chainEnd, otherStart)) {
          chain.push(...other.geometry.slice(1))
          available.delete(j)
          chainRefs.push(other.ref)
          extended = true
          break
        } else if (coordsEqual(chainEnd, otherEnd)) {
          chain.push(...[...other.geometry].reverse().slice(1))
          available.delete(j)
          chainRefs.push(other.ref)
          extended = true
          break
        } else if (coordsEqual(chainStart, otherEnd)) {
          chain.unshift(...other.geometry.slice(0, -1))
          available.delete(j)
          chainRefs.push(other.ref)
          extended = true
          break
        } else if (coordsEqual(chainStart, otherStart)) {
          chain.unshift(...[...other.geometry].reverse().slice(0, -1))
          available.delete(j)
          chainRefs.push(other.ref)
          extended = true
          break
        }
      }
    }

    if (isClosed(chain)) {
      rings.push(chain.map((p) => [p.lon, p.lat] as [number, number]))
    } else {
      incomplete.push(...chainRefs)
    }
  }

  for (const i of available) incomplete.push(ways[i].ref)

  return { rings, incomplete, skipped }
}

/** Attach each inner ring to every outer ring that contains its first point. */
export function associateHoles(
  outers: [number, number][][],
  inners: [number, number][][],
): { outer: [number, number][]; holes: [number, number][][] }[] {
  const result: { outer: [number, number][]; holes: [number, number][][] }[] = []
  for (const outer of outers) {
    const holes: [number, number][][] = []
    for (const inner of inners) {
      if (inner.length > 0 && pointInPolygon(inner[0], outer)) holes.push(inner)
    }
    result.push({ outer, holes })
  }
  return result
}
