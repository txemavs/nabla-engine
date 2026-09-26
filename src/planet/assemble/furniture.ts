/**
 * Street lamps, signals, pylons, wind turbines and power lines.
 * A lamp head is a low-poly sphere. The publisher welds the mesh.
 */
import type { MapFeature } from '../extract/contract.js'
import { clipSegment } from '../../math/planar/polygon.js'
import { rotationDegrees, type Vec3Tuple } from '../../math/frame/vectors.js'
import { createEntity } from '../../entity/schema.js'
import { boxSolid, type SolidGeometry } from '../../math/solid/mesh.js'
import { type District, metric } from './district.js'

/** Low-poly head for a street lamp. Faces only; the publisher welds the mesh. */
function sphereSolid(radius: number): SolidGeometry {
  const slices = 8
  const vertices: Vec3Tuple[] = [[0, radius, 0]]
  for (let ring = 1; ring <= 3; ring++) {
    const phi = (ring / 4) * Math.PI
    for (let slice = 0; slice < slices; slice++) {
      const theta = (slice / slices) * Math.PI * 2
      vertices.push([
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta),
      ])
    }
  }
  vertices.push([0, -radius, 0])
  const faces: number[][] = []
  for (let slice = 0; slice < slices; slice++) {
    const a = 1 + slice
    const b = 1 + ((slice + 1) % slices)
    faces.push([0, b, a])
  }
  for (let ring = 0; ring < 2; ring++) {
    for (let slice = 0; slice < slices; slice++) {
      const a = 1 + ring * slices + slice
      const b = 1 + ring * slices + ((slice + 1) % slices)
      const c = a + slices
      const d = b + slices
      faces.push([a, b, d, c])
    }
  }
  const south = vertices.length - 1
  const base = 1 + 2 * slices
  for (let slice = 0; slice < slices; slice++)
    faces.push([south, base + slice, base + ((slice + 1) % slices)])
  return { vertices, edges: [], faces }
}

export function emitFurniture(d: District, f: MapFeature): boolean {
  const tags = f.tags
  if (tags.highway === 'street_lamp' || tags.highway === 'traffic_signals') {
    const coordinate = f.rings[0]?.coordinates[0]
    if (!coordinate) return true
    const p = d.project(coordinate)
    if (!d.inside(p)) return true
    p[1] = d.height(p[0], p[2])
    const lamp = tags.highway === 'street_lamp'
    const id = 'osm-' + f.id.replace('/', '-')
    const pole = createEntity(id + '-pole', 'solid', [p[0], p[1] + (lamp ? 2.5 : 1.6), p[2]])
    pole.name = lamp ? 'Farola' : 'Semáforo'
    pole.geometry = boxSolid(lamp ? [0.12, 5, 0.12] : [0.14, 3.2, 0.14])
    pole.color = '#6d7680'
    pole.source = d.source(f)
    d.entities.push(pole)
    const head = createEntity(id + '-head', 'solid', [p[0], p[1] + (lamp ? 5.75 : 3.5), p[2]])
    head.name = pole.name
    head.geometry = lamp ? sphereSolid(0.75) : boxSolid([0.32, 0.9, 0.28])
    head.color = lamp ? '#fff1d2' : '#1c1c1c'
    head.source = d.source(f)
    d.entities.push(head)
    return true
  }
  if (
    tags.power === 'tower' ||
    (tags.power === 'generator' && tags['generator:source'] === 'wind')
  ) {
    const coordinate = f.rings[0]?.coordinates[0]
    if (!coordinate) return true
    const p = d.project(coordinate)
    if (!d.inside(p)) return true
    p[1] = d.height(p[0], p[2])
    const wind = tags['generator:source'] === 'wind'
    const id = 'osm-' + f.id.replace('/', '-')
    const mast = metric(tags.height, wind ? 80 : 42)
    const pole = createEntity(id + '-mast', 'solid', [p[0], p[1] + mast / 2, p[2]])
    pole.name = wind ? 'Aerogenerador' : 'Torre eléctrica'
    pole.geometry = boxSolid(wind ? [3.2, mast, 3.2] : [6, mast, 6])
    pole.color = '#9aa0a6'
    pole.source = d.source(f)
    d.entities.push(pole)
    if (wind) {
      const hub = createEntity(id + '-hub', 'solid', [p[0], p[1] + mast, p[2]])
      hub.geometry = sphereSolid(2.4)
      hub.color = '#d5d8dc'
      hub.source = d.source(f)
      d.entities.push(hub)
      for (const turn of [0, 120, 240]) {
        const blade = createEntity(id + '-blade-' + turn, 'solid', [p[0], p[1] + mast, p[2]])
        blade.geometry = boxSolid([2.2, 28, 0.6])
        blade.color = '#f4f6f8'
        blade.transform.rotation = rotationDegrees(0, 0, turn)
        blade.source = d.source(f)
        d.entities.push(blade)
      }
    }

    return true
  }
  if (tags.power === 'line') {
    const points = f.rings[0]?.coordinates.map(d.project)
    if (!points || points.length < 2) return true
    let part = 0
    for (let i = 1; i < points.length; i++) {
      const segment = clipSegment(points[i - 1], points[i], d.half, d.depth)
      if (!segment) continue
      const [a, b] = segment
      const cable = createEntity('osm-' + f.id.replace('/', '-') + '-cable-' + part, 'solid')
      cable.name = 'Línea eléctrica'
      cable.geometry = spanSolid(a, d.height(a[0], a[2]) + 32, b, d.height(b[0], b[2]) + 32, 0.35)
      cable.color = '#6e757c'
      cable.source = d.source(f)
      d.entities.push(cable)
      part += 1
    }
    return true
  }
  return false
}
