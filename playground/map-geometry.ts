import { BufferAttribute, BufferGeometry, Color } from 'three'
import { roadGeometry } from '../src/draped-road.js'
import { terrainVertices, terrainIndices } from '../src/terrain.js'
import { triangles, trianglesWithRoofInfo } from '../src/solid.js'
import type { Entity } from '../src/scene.js'

/** Ephemeral render data: never part of scene JSON, history or the persistent cache. */
export interface MapGeometryBuffers {
  position: Float32Array
  normal: Float32Array
  index?: Uint32Array
  color?: Float32Array
}
export type PreparedMapGeometry = Record<string, MapGeometryBuffers>
const prepared = new WeakMap<Entity, MapGeometryBuffers>()

export function geometryFromBuffers(data: MapGeometryBuffers): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(data.position, 3))
  geometry.setAttribute('normal', new BufferAttribute(data.normal, 3))
  if (data.index) geometry.setIndex(new BufferAttribute(data.index, 1))
  if (data.color) geometry.setAttribute('color', new BufferAttribute(data.color, 3))
  return geometry
}

/** Consume once; the mesh owns these transferred arrays afterwards. */
export function takeMapGeometry(entity: Entity): BufferGeometry | undefined {
  const data = prepared.get(entity)
  prepared.delete(entity)
  return data && geometryFromBuffers(data)
}
export function receiveMapGeometry(entities: Entity[], buffers: PreparedMapGeometry): void {
  for (const e of entities) if (buffers[e.id]) prepared.set(e, buffers[e.id])
}

/** Called in the map worker, including expensive terrain clipping and normal generation. */
export function prepareMapGeometry(entities: Entity[]): PreparedMapGeometry {
  const byId = new Map(entities.map((e) => [e.id, e]))
  const result: PreparedMapGeometry = Object.create(null)
  for (const e of entities) {
    let vertices: number[], indices: number[] | undefined, colors: number[] | undefined
    if (e.road) {
      const terrain = byId.get(e.road.terrainId)?.terrain
      if (!terrain) continue // A separately authored reference is handled by the scene renderer.
      const data = roadGeometry(terrain, e.road.paths, e.road.width)
      vertices = data.vertices.flat()
      indices = data.faces.flat()
    } else if (e.terrain) {
      vertices = terrainVertices(e.terrain).flat()
      indices = terrainIndices(e.terrain)
    } else if (e.geometry) {
      const hasRoofColor = e.roofColor && e.geometry.roofFaces?.length
      if (hasRoofColor) {
        const { indices: triIndices, isRoof } = trianglesWithRoofInfo(e.geometry)
        vertices = []
        colors = []
        const wallColor = new Color(e.color)
        const roofColor = new Color(e.roofColor!)
        for (let i = 0; i < triIndices.length; i++) {
          const tri = triIndices[i]
          const color = isRoof[i] ? roofColor : wallColor
          for (const idx of tri) {
            const v = e.geometry!.vertices[idx]
            vertices.push(v[0], v[1], v[2])
            colors.push(color.r, color.g, color.b)
          }
        }
      } else {
        vertices = triangles(e.geometry).flatMap((f) => f.flatMap((i) => e.geometry!.vertices[i]))
      }
    } else continue
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3))
    if (indices) geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1))
    if (colors) geometry.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
    geometry.computeVertexNormals()
    result[e.id] = {
      position: geometry.getAttribute('position').array as Float32Array,
      normal: geometry.getAttribute('normal').array as Float32Array,
      index: geometry.index?.array as Uint32Array | undefined,
      color: geometry.getAttribute('color')?.array as Float32Array | undefined,
    }
    geometry.dispose()
  }
  return result
}
export function mapGeometryTransfers(buffers: PreparedMapGeometry): ArrayBuffer[] {
  return Object.values(buffers).flatMap((data) =>
    [
      data.position.buffer,
      data.normal.buffer,
      ...(data.index ? [data.index.buffer] : []),
      ...(data.color ? [data.color.buffer] : []),
    ].map((buffer) => buffer as ArrayBuffer),
  )
}
