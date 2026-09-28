/**
 * OSM streets and rails for one district.
 * A bridge or tunnel is profiled so its ends meet the heightfield.
 * Rails become ballast and two rails; a highway stays a driveable road group.
 */
import type { MapFeature } from '../extract/contract.js'
import { clipSegment } from '../../math/planar/polygon.js'
import { createEntity } from '../../entity/schema.js'
import type { Vec3Tuple } from '../../math/frame/vectors.js'
import {
  roadGeometry,
  roadHeightOffset,
  type RoadGeometryOptions,
} from '../land/roads/draped-road.js'
import { type District, metric } from './district.js'

export function emitWay(d: District, f: MapFeature): boolean {
  const tags = f.tags
  if (!(tags.highway || tags.railway)) return false
  const rail =
    ['rail', 'light_rail', 'tram', 'narrow_gauge'].includes(tags.railway) &&
    (!tags.tunnel || tags.tunnel === 'no')
  if (!tags.highway && !rail) return true
  if (['construction', 'proposed', 'steps'].includes(tags.highway)) return true
  const foot = ['footway', 'path', 'pedestrian', 'cycleway'].includes(tags.highway),
    width = Math.min(25, Math.max(1, metric(tags.width, foot ? 2 : metric(tags.lanes, 2) * 3)))
  const elevation =
    tags.bridge && tags.bridge !== 'no'
      ? 'bridge'
      : tags.tunnel && tags.tunnel !== 'no'
        ? 'tunnel'
        : undefined
  const parsedLayer = Number.parseInt(tags.layer ?? '', 10)
  const layer = Number.isFinite(parsedLayer) ? Math.max(-5, Math.min(5, parsedLayer)) : undefined
  const paths: Vec3Tuple[][] = []
  for (const ring of f.rings) {
    const points = ring.coordinates.map(d.project)
    if (elevation === 'bridge' || elevation === 'tunnel') {
      const distances = [0]
      for (let i = 1; i < points.length; i++)
        distances.push(
          distances[i - 1] +
            Math.hypot(points[i][0] - points[i - 1][0], points[i][2] - points[i - 1][2]),
        )
      const total = distances.at(-1)!,
        ramp = Math.min(30, total / 4)
      for (let i = 1; i < points.length; i++) {
        const segment = clipSegment(points[i - 1], points[i], d.half, d.depth)
        if (!segment) continue
        const [a, b] = segment,
          length = Math.hypot(b[0] - a[0], b[2] - a[2]),
          start = distances[i - 1] + Math.hypot(a[0] - points[i - 1][0], a[2] - points[i - 1][2]),
          steps = Math.max(1, Math.ceil(length / 5))
        const profile: Vec3Tuple[] = []
        for (let k = 0; k <= steps; k++) {
          const f = k / steps,
            x = a[0] + (b[0] - a[0]) * f,
            z = a[2] + (b[2] - a[2]) * f,
            along = start + length * f
          profile.push([
            x,
            d.height(x, z) +
              roadHeightOffset(elevation, layer) *
                Math.max(
                  0,
                  Math.min(1, along / Math.max(1, ramp), (total - along) / Math.max(1, ramp)),
                ),
            z,
          ])
        }
        paths.push(profile)
      }
      continue
    }

    for (let i = 1; i < points.length; i++) {
      const segment = clipSegment(points[i - 1], points[i], d.half, d.depth)
      if (segment) paths.push(segment)
    }
  }
  if (paths.length && rail) {
    const gauge = Math.max(0.5, Math.min(2.5, metric(tags.gauge, 1435) / 1000))
    const options: RoadGeometryOptions = {
      ...(elevation && { elevation }),
      ...((elevation === 'bridge' || elevation === 'tunnel') && { profiled: true }),
      ...(layer !== undefined && { layer }),
    }
    d.addSurface(
      f,
      roadGeometry(d.data.terrain, paths, gauge + 1.4, options),
      'ballast',
      '#68655d',
      d.groups[5],
    )
    for (const [side, offset] of [
      [0, -gauge / 2],
      [1, gauge / 2],
    ]) {
      const shifted = paths.map((path) =>
        path.map((p, i): Vec3Tuple => {
          const a = path[Math.max(0, i - 1)],
            b = path[Math.min(path.length - 1, i + 1)]
          const length = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1
          return [
            p[0] - ((b[2] - a[2]) / length) * offset,
            p[1],
            p[2] + ((b[0] - a[0]) / length) * offset,
          ]
        }),
      )
      const g = roadGeometry(d.data.terrain, shifted, 0.09, options)
      for (const v of g.vertices) v[1] += 0.055
      d.addSurface(f, g, `rail-${side}`, '#a4a7aa', d.groups[5])
    }
  }
  if (paths.length && (!rail || tags.highway)) {
    const e = createEntity('osm-' + f.id.replace('/', '-') + d.suffix, 'group')
    e.name = tags.name ?? tags.highway
    e.road = {
      paths,
      width,
      terrainId: d.terrain.id,
      ...(elevation && { elevation }),
      ...((elevation === 'bridge' || elevation === 'tunnel') && { profiled: true }),
      ...(layer !== undefined && { layer }),
    }
    e.color = foot ? '#b2b0a0' : '#525c60'
    e.parentId = d.groups[1]
    e.source = d.source(f)
    d.entities.push(e)
  }
  return true
}
