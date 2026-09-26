import * as THREE from 'three'
import { geoToLocal, localToGeo } from '../../math/geo/sphere.js'
import {
  mapTileAt,
  mapTileBounds,
  mapTilePath,
  parseMapTilePath,
  type MapTile,
} from '../../scene/mercator.js'
import type { GeoPoint } from '../../math/geo/sphere.js'
import type { Vec3Tuple } from '../../stage/scene.js'

const MAP = 'https://api.openstreetmap.org/api/0.6/map'
const CACHE = 'nabla-lamps-z15:'

export const fieldLayers = { lamps: true, navigation: true }

type Kind = 'lamp' | 'nav' | 'buoy'
type LampCell = {
  poles: THREE.InstancedMesh
  heads: THREE.InstancedMesh
  spots: { x: number; y: number; z: number; grounded: boolean }[]
}
type Stored = { lat: number; lon: number; tags: Record<string, string> }
type Mark = {
  kind: Kind
  group: THREE.Group
  glow: THREE.MeshBasicMaterial
  flash: number
  color: string
  grounded: boolean
}

/** One z15 cell, kept like the terrain tile. The network runs once per cell. */
export class FieldLights {
  readonly root = new THREE.Group()
  private readonly cells = new Map<string, Mark[]>()
  private readonly lampCells = new Map<string, LampCell>()
  private readonly loading = new Set<string>()
  private nextTry = new Map<string, number>()
  private readonly poleGeometry = new THREE.CylinderGeometry(0.05, 0.07, 5, 5)
  private readonly headGeometry = new THREE.SphereGeometry(0.75, 8, 6)
  private readonly poleMaterial = new THREE.MeshBasicMaterial({ color: '#6d7680' })
  private readonly headMaterial = new THREE.MeshBasicMaterial({
    color: '#fff1d2',
    toneMapped: false,
  })
  private readonly lampMatrix = new THREE.Matrix4()
  constructor() {
    this.root.name = 'Field lights'
  }
  update(
    origin: GeoPoint | undefined,
    camera: Vec3Tuple,
    _night: boolean,
    now: number,
    heightAt: (position: Vec3Tuple) => number | undefined,
    tiles: MapTile[] = [],
  ): void {
    const showLamps = fieldLayers.lamps
    const showNav = fieldLayers.navigation
    this.root.visible = !!(origin && (showLamps || showNav))
    if (!origin || !this.root.visible) return
    const wanted = new Set(tiles.filter((tile) => tile.z === 15).map(mapTilePath))
    if (!wanted.size) {
      const here = localToGeo(origin, camera)
      wanted.add(mapTilePath(mapTileAt(here.latitude, here.longitude, 15)))
    }
    for (const path of wanted) this.ensure(origin, path)
    for (const path of this.cells.keys()) if (!wanted.has(path)) this.drop(path)
    let groundBudget = 12
    for (const cell of this.lampCells.values()) {
      cell.poles.visible = cell.heads.visible = showLamps
      if (!showLamps) continue
      let moved = false
      for (let i = 0; i < cell.spots.length && groundBudget > 0; i++) {
        const spot = cell.spots[i]
        if (spot.grounded) continue
        groundBudget--
        const y = heightAt([spot.x, spot.y, spot.z])
        spot.grounded = true
        if (y === undefined) continue
        spot.y = y
        moved = true
        this.placeLamp(cell, i)
      }
      if (moved) {
        cell.poles.instanceMatrix.needsUpdate = true
        cell.heads.instanceMatrix.needsUpdate = true
      }
    }
    for (const marks of this.cells.values()) {
      for (const mark of marks) {
        const layer = mark.kind === 'lamp' ? showLamps : showNav
        mark.group.visible = layer
        if (!layer) continue
        const on = mark.flash === 0 || Math.floor(now / mark.flash) % 2 === 0
        mark.glow.color.set(on ? mark.color : '#141414')
        if (mark.grounded) continue
        const y = heightAt(mark.group.position.toArray())
        if (y === undefined) continue
        mark.group.position.y = y
        mark.grounded = true
      }
    }
  }
  private ensure(origin: GeoPoint, path: string): void {
    if (this.cells.has(path) || this.loading.has(path)) return
    const wait = this.nextTry.get(path) ?? 0
    if (performance.now() < wait) return
    const cached = readCache(path)
    if (cached) {
      this.mount(origin, path, cached)
      return
    }
    this.loading.add(path)
    const bounds = mapTileBounds(parseMapTilePath(path))
    loadMarks(bounds.south, bounds.west, bounds.north, bounds.east)
      .then((elements) => {
        writeCache(path, elements)
        this.mount(origin, path, elements)
      })
      .catch(() => {
        this.nextTry.set(path, performance.now() + 8000)
      })
      .finally(() => {
        this.loading.delete(path)
      })
  }
  private mount(origin: GeoPoint, path: string, elements: Stored[]): void {
    if (this.cells.has(path)) return
    const posts = elements.filter((element) => element.tags.highway === 'street_lamp')
    if (posts.length) {
      const poles = new THREE.InstancedMesh(this.poleGeometry, this.poleMaterial, posts.length)
      const heads = new THREE.InstancedMesh(this.headGeometry, this.headMaterial, posts.length)
      poles.frustumCulled = heads.frustumCulled = false
      const spots = posts.map((element) => {
        const at = geoToLocal(origin, {
          latitude: element.lat,
          longitude: element.lon,
          altitude: 0,
        })
        return { x: at[0], y: at[1], z: at[2], grounded: false }
      })
      const cell = { poles, heads, spots }
      for (let i = 0; i < spots.length; i++) this.placeLamp(cell, i)
      poles.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = true
      this.root.add(poles, heads)
      this.lampCells.set(path, cell)
    }
    const marks: Mark[] = []
    for (const element of elements) {
      if (element.tags.highway === 'street_lamp') continue
      const placed = place(element.tags)
      if (!placed || placed.kind === 'lamp') continue
      const at = geoToLocal(origin, {
        latitude: element.lat,
        longitude: element.lon,
        altitude: 0,
      })
      const group = new THREE.Group()
      group.position.set(at[0], at[1], at[2])
      const glow = new THREE.MeshBasicMaterial({ color: placed.color, toneMapped: false })
      if (placed.kind === 'buoy') {
        buildBuoy(group, element.tags, glow)
      } else {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), glow)
        ball.position.y = 6
        group.add(ball)
      }
      this.root.add(group)
      marks.push({ ...placed, group, glow, grounded: false })
    }
    this.cells.set(path, marks)
  }
  /** Upright posts in the geographic frame. The head is not a collider. */
  poles(): { position: Vec3Tuple; half: Vec3Tuple }[] {
    const poles: { position: Vec3Tuple; half: Vec3Tuple }[] = []
    for (const marks of this.cells.values())
      for (const mark of marks) {
        if (mark.kind === 'nav') continue
        const hull = mark.group.userData.hull as { radius: number; height: number } | undefined
        const height = hull?.height ?? 3
        const radius = hull?.radius ?? 0.6
        const p = mark.group.position
        poles.push({
          position: [p.x, p.y + height / 2, p.z],
          half: [radius, height / 2, radius],
        })
      }
    return poles
  }
  private placeLamp(cell: LampCell, index: number): void {
    const spot = cell.spots[index]
    this.lampMatrix.makeTranslation(spot.x, spot.y + 2.5, spot.z)
    cell.poles.setMatrixAt(index, this.lampMatrix)
    this.lampMatrix.makeTranslation(spot.x, spot.y + 5.75, spot.z)
    cell.heads.setMatrixAt(index, this.lampMatrix)
  }
  private drop(path: string): void {
    const lamps = this.lampCells.get(path)
    if (lamps) {
      lamps.poles.removeFromParent()
      lamps.heads.removeFromParent()
      this.lampCells.delete(path)
    }
    const marks = this.cells.get(path)
    if (!marks) return
    for (const mark of marks) {
      mark.group.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry.dispose()
          node.material.dispose()
        }
      })
      mark.group.removeFromParent()
    }
    this.cells.delete(path)
  }
}

function readCache(path: string): Stored[] | null {
  const raw = localStorage.getItem(CACHE + path)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Stored[]
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}
function writeCache(path: string, elements: Stored[]): void {
  try {
    localStorage.setItem(CACHE + path, JSON.stringify(elements))
  } catch {
    // A full browser store must not drop the cells already on screen.
  }
}

async function loadMarks(
  south: number,
  west: number,
  north: number,
  east: number,
): Promise<Stored[]> {
  const response = await fetch(`${MAP}?bbox=${west},${south},${east},${north}`, {
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error(String(response.status))
  const xml = new DOMParser().parseFromString(await response.text(), 'text/xml')
  const elements: Stored[] = []
  for (const node of xml.querySelectorAll('node')) {
    const tags: Record<string, string> = {}
    for (const tag of node.querySelectorAll('tag')) {
      const key = tag.getAttribute('k')
      const value = tag.getAttribute('v')
      if (key && value) tags[key] = value
    }
    if (
      tags.highway !== 'street_lamp' &&
      !tags['seamark:type'] &&
      tags.man_made !== 'beacon' &&
      tags.obstacle !== 'beacon'
    )
      continue
    const lat = Number(node.getAttribute('lat'))
    const lon = Number(node.getAttribute('lon'))
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    elements.push({ lat, lon, tags })
  }
  return elements
}

function place(tags: Record<string, string>): { kind: Kind; color: string; flash: number } | null {
  if (tags.highway === 'street_lamp') return { kind: 'lamp', color: '#fff1d2', flash: 0 }
  const type = tags['seamark:type'] ?? ''
  const beacon = tags.man_made === 'beacon' || tags.obstacle === 'beacon'
  if (!type && !beacon) return null
  const body = type.includes('buoy') || type.includes('beacon') || beacon
  return {
    kind: type.startsWith('light') || !body ? 'nav' : 'buoy',
    color: lampHex(tags, type),
    flash: flashOf(tags['seamark:light:character'] ?? tags['seamark:light:1:character']),
  }
}

/** Colour tag order is top to bottom. Vertex colours, so a later GLB keeps COLOR_0. */
function buildBuoy(group: THREE.Group, tags: Record<string, string>, glow: THREE.Material): void {
  const type = tags['seamark:type'] ?? ''
  const shape = markShape(tags, type)
  const names = bodyColourNames(tags, type)
  const lightH = lightMetres(tags)
  const size = bodySize(shape, lightH)
  const top = addBody(group, shape, names, size)
  const category = typedValue(tags, ':category')
  const topShape =
    tags['seamark:topmark:shape'] || (type.includes('cardinal') ? cardinalTopmark(category) : '')
  const topColour = (tags['seamark:topmark:colour'] || (type.includes('cardinal') ? 'black' : names[0] || 'black'))
    .split(';')[0]
  const crown = addTopmark(group, topShape, topColour, top)
  const lit = !!(
    tags['seamark:light:character'] ||
    tags['seamark:light:1:character'] ||
    tags['seamark:light:colour'] ||
    tags['seamark:light:1:colour']
  )
  if (lit) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glow)
    lamp.position.y = crown + 0.32
    group.add(lamp)
  } else {
    const holder = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 3), glow)
    holder.visible = false
    group.add(holder)
  }
  group.userData.hull = { radius: size.radius, height: Math.max(size.height, crown) }
}

function addBody(
  group: THREE.Group,
  shape: string,
  names: string[],
  size: { radius: number; height: number },
): number {
  const colours = names.length ? names : ['white']
  if (shape.includes('conic') || shape === 'cone') {
    const geo = new THREE.ConeGeometry(size.radius, size.height, 14)
    solid(geo, paint(colours[0]) ?? '#f4f7ff')
    const mesh = painted(geo)
    mesh.position.y = size.height / 2
    group.add(mesh)
    return size.height
  }
  if (shape.includes('spher')) {
    const geo = new THREE.SphereGeometry(size.radius, 16, 12)
    solid(geo, paint(colours[0]) ?? '#f4f7ff')
    const mesh = painted(geo)
    mesh.position.y = size.radius
    group.add(mesh)
    return size.radius * 2
  }
  const band = size.height / colours.length
  for (let i = 0; i < colours.length; i++) {
    const geo = new THREE.CylinderGeometry(size.radius, size.radius, band, 12)
    solid(geo, paint(colours[i]) ?? '#f4f7ff')
    const mesh = painted(geo)
    mesh.position.y = size.height - band / 2 - i * band
    group.add(mesh)
  }
  return size.height
}

function addTopmark(group: THREE.Group, shape: string, colour: string, y: number): number {
  if (!shape) return y
  const hex = paint(colour) ?? '#1a1a1a'
  const s = shape.toLowerCase()
  if (s.includes('x')) {
    for (const turn of [Math.PI / 4, -Math.PI / 4]) {
      const geo = new THREE.BoxGeometry(0.08, 0.7, 0.08)
      solid(geo, hex)
      const mesh = painted(geo)
      mesh.rotation.z = turn
      mesh.position.y = y + 0.4
      group.add(mesh)
    }
    return y + 0.75
  }
  if (s.includes('2 cone') || s.includes('two cone')) {
    if (s.includes('base')) return conesBaseTogether(group, hex, y)
    if (s.includes('point together') || s.includes('points together'))
      return conesPointTogether(group, hex, y)
    const up = !s.includes('down')
    let cursor = y
    for (let i = 0; i < 2; i++) {
      if (up) {
        const mesh = coneMesh(hex, true)
        placeCone(mesh, true, cursor)
        group.add(mesh)
        cursor += 0.48
      } else {
        const mesh = coneMesh(hex, false)
        placeCone(mesh, false, cursor + 0.42)
        group.add(mesh)
        cursor += 0.48
      }
    }
    return cursor
  }
  if (s.includes('cone')) {
    const up = !s.includes('down')
    const mesh = coneMesh(hex, up)
    placeCone(mesh, up, up ? y : y + 0.42)
    group.add(mesh)
    return y + 0.42
  }
  if (s.includes('cylinder') || s.includes('can')) {
    const geo = new THREE.CylinderGeometry(0.22, 0.22, 0.36, 8)
    solid(geo, hex)
    const mesh = painted(geo)
    mesh.position.y = y + 0.18
    group.add(mesh)
    return y + 0.36
  }
  return y
}

const CONE_H = 0.42

function coneMesh(hex: string, up: boolean): THREE.Mesh {
  const geo = new THREE.ConeGeometry(0.28, CONE_H, 8)
  solid(geo, hex)
  const mesh = painted(geo)
  if (!up) mesh.rotation.x = Math.PI
  return mesh
}

function placeCone(mesh: THREE.Mesh, up: boolean, baseY: number): void {
  mesh.position.y = up ? baseY + CONE_H / 2 : baseY - CONE_H / 2
}

function conesBaseTogether(group: THREE.Group, hex: string, y: number): number {
  const mid = y + CONE_H
  const lower = coneMesh(hex, false)
  placeCone(lower, false, mid)
  const upper = coneMesh(hex, true)
  placeCone(upper, true, mid)
  group.add(lower, upper)
  return mid + CONE_H
}

function conesPointTogether(group: THREE.Group, hex: string, y: number): number {
  const mid = y + CONE_H
  const lower = coneMesh(hex, true)
  placeCone(lower, true, y)
  const upper = coneMesh(hex, false)
  placeCone(upper, false, mid + CONE_H)
  group.add(lower, upper)
  return mid + CONE_H
}

function markShape(tags: Record<string, string>, type: string): string {
  const shape = typedValue(tags, ':shape')
  if (shape && !shape.includes('topmark')) return shape
  if (type.includes('cardinal')) return 'pillar'
  if (type.includes('buoy')) return 'can'
  return 'pile'
}

function bodySize(shape: string, lightH: number): { radius: number; height: number } {
  if (shape.includes('conic') || shape === 'cone') return { radius: 0.95, height: 2.5 }
  if (shape.includes('can') || shape.includes('cyl')) return { radius: 0.8, height: 1.8 }
  if (shape.includes('spher')) return { radius: 0.9, height: 1.8 }
  if (shape.includes('barrel')) return { radius: 0.95, height: 1.5 }
  if (shape.includes('spar')) return { radius: 0.16, height: lightH > 2 ? lightH : 4.5 }
  if (shape.includes('pile') || shape.includes('pole') || shape.includes('beacon'))
    return { radius: 0.22, height: lightH > 2 ? Math.max(3, lightH - 0.7) : 5 }
  return { radius: 0.45, height: 3.2 }
}

function bodyColourNames(tags: Record<string, string>, type: string): string[] {
  for (const [key, value] of Object.entries(tags)) {
    if ((!key.endsWith(':colour') && !key.endsWith(':color')) || key.includes('light') || key.includes('topmark'))
      continue
    const names = value
      .split(';')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean)
    if (names.length) return names
  }
  const category = typedValue(tags, ':category')
  const regionB = typedValue(tags, ':system').includes('iala-b')
  if (category === 'port') return [regionB ? 'green' : 'red']
  if (category === 'starboard') return [regionB ? 'red' : 'green']
  if (type.includes('special')) return ['yellow']
  if (type.includes('isolated')) return ['black', 'red', 'black']
  if (type.includes('cardinal')) return ['yellow', 'black']
  return ['white']
}

function typedValue(tags: Record<string, string>, suffix: string): string {
  for (const [key, value] of Object.entries(tags)) {
    if (key.endsWith(suffix) && !key.includes('topmark') && !key.includes('light')) return value.toLowerCase()
  }
  return ''
}

function cardinalTopmark(category: string): string {
  if (category === 'north') return '2 cones point up'
  if (category === 'south') return '2 cones point down'
  if (category === 'east') return '2 cones base together'
  if (category === 'west') return '2 cones point together'
  return ''
}

function lampHex(tags: Record<string, string>, type: string): string {
  const raw = (tags['seamark:light:colour'] || tags['seamark:light:1:colour'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase()
  const fromLight = raw ? paint(raw) : null
  if (fromLight) return fromLight
  if (type.includes('cardinal')) return '#f4f7ff'
  return paint(bodyColourNames(tags, type)[0] ?? '') ?? '#f4f7ff'
}

function lightMetres(tags: Record<string, string>): number {
  const raw = Number(tags['seamark:light:height'] || tags['seamark:light:1:height'])
  return Number.isFinite(raw) ? raw : 0
}

function solid(geometry: THREE.BufferGeometry, hex: string): void {
  const color = new THREE.Color(hex)
  const count = geometry.attributes.position.count
  const colours = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    colours[i * 3] = color.r
    colours[i * 3 + 1] = color.g
    colours[i * 3 + 2] = color.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3))
}

function painted(geometry: THREE.BufferGeometry): THREE.Mesh {
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.06 }),
  )
}

function paint(colour: string): string | null {
  if (colour.includes('red')) return '#ff2430'
  if (colour.includes('green')) return '#3dff6e'
  if (colour.includes('yellow') || colour.includes('amber') || colour.includes('orange'))
    return '#ffd25a'
  if (colour.includes('blue')) return '#7ec8ff'
  if (colour.includes('white')) return '#f4f7ff'
  if (colour.includes('black')) return '#1a1a1a'
  return null
}

function flashOf(character: string | undefined): number {
  const text = character ?? ''
  if (/VQ|UQ|Q/.test(text)) return 180
  if (/Fl|Oc|Iso/.test(text)) return 700
  return 0
}
