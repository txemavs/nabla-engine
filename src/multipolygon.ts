/**
 * Multipolygon assembly for OSM relations.
 *
 * OSM multipolygon relations are composed of member ways with 'outer' or 'inner' roles.
 * These ways often need to be joined at shared endpoints to form complete closed rings.
 * This module handles the assembly, including:
 * - Joining ways that share endpoints
 * - Handling incomplete relations where some members are missing
 * - Salvaging usable rings even when some ways cannot be joined
 */

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

/**
 * Assemble ways into closed rings by joining at shared endpoints.
 * Returns all successfully assembled rings and tracks which ways couldn't be joined.
 */
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

  for (const i of available) {
    incomplete.push(ways[i].ref)
  }

  return { rings, incomplete, skipped }
}

/**
 * Check if a coordinate is inside a polygon (ray casting algorithm).
 */
export function pointInPolygon(point: [number, number], ring: [number, number][]): boolean {
  let inside = false
  const [x, y] = point
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/**
 * Associate inner rings with their containing outer ring.
 * Returns outer rings with their associated holes.
 */
export function associateHoles(
  outers: [number, number][][],
  inners: [number, number][][],
): { outer: [number, number][]; holes: [number, number][][] }[] {
  const result: { outer: [number, number][]; holes: [number, number][][] }[] = []

  for (const outer of outers) {
    const holes: [number, number][][] = []
    for (const inner of inners) {
      if (inner.length > 0 && pointInPolygon(inner[0], outer)) {
        holes.push(inner)
      }
    }
    result.push({ outer, holes })
  }

  return result
}
