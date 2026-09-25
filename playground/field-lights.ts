import * as THREE from 'three'
import { geoToLocal, localToGeo } from '../src/math/geo/sphere.js'
import { mapTileAt, mapTileBounds, mapTilePath, parseMapTilePath, type MapTile } from '../src/scene/mercator.js'
import type { GeoPoint } from '../src/math/geo/sphere.js'
import type { Vec3Tuple } from '../src/stage/scene.js'

const MAP = 'https://api.openstreetmap.org/api/0.6/map'
const CACHE = 'nabla-lamps-z15:'

export const fieldLayers = { lamps: true, navigation: true }

type Kind = 'lamp' | 'nav' | 'buoy'
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
  private readonly loading = new Set<string>()
  private nextTry = new Map<string, number>()
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
    const marks: Mark[] = []
    for (const element of elements) {
      const placed = place(element.tags)
      if (!placed) continue
      const at = geoToLocal(origin, {
        latitude: element.lat,
        longitude: element.lon,
        altitude: placed.kind === 'lamp' ? 0 : Number(element.tags['seamark:light:height']) || 0,
      })
      const group = new THREE.Group()
      group.position.set(at[0], at[1], at[2])
      const glow = new THREE.MeshBasicMaterial({ color: placed.color, toneMapped: false })
      if (placed.kind === 'buoy') {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.28, 4.2, 6),
          new THREE.MeshStandardMaterial({ color: '#2c3338', roughness: 0.8 }),
        )
        pole.position.y = 2.1
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), glow)
        head.position.y = 4.5
        group.add(pole, head)
      } else if (placed.kind === 'lamp') {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.07, 5, 5),
          new THREE.MeshBasicMaterial({ color: '#6d7680' }),
        )
        pole.position.y = 2.5
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), glow)
        ball.position.y = 5.75
        group.add(pole, ball)
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
  private drop(path: string): void {
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
  const colour = (tags['seamark:light:colour'] ?? tags['seamark:buoy_lateral:colour'] ?? tags['seamark:beacon_lateral:colour'] ?? '').split(';')[0]
  const category = tags['seamark:buoy_lateral:category'] ?? tags['seamark:beacon_lateral:category'] ?? ''
  const lateral = type.includes('lateral') || category === 'port' || category === 'starboard'
  if (lateral) {
    const port = category === 'port' || colour === 'red'
    return { kind: 'buoy', color: port ? '#ff2430' : '#3dff6e', flash: flashOf(tags['seamark:light:character']) }
  }
  if (type.startsWith('light') || tags['man_made'] === 'beacon' || tags.obstacle === 'beacon')
    return { kind: 'nav', color: paint(colour || (tags.obstacle === 'beacon' ? 'red' : 'white')), flash: flashOf(tags['seamark:light:character']) }
  return null
}

function paint(colour: string): string {
  if (colour.includes('red')) return '#ff2430'
  if (colour.includes('green')) return '#3dff6e'
  if (colour.includes('yellow') || colour.includes('amber')) return '#ffd25a'
  if (colour.includes('blue')) return '#7ec8ff'
  return '#f4f7ff'
}

function flashOf(character: string | undefined): number {
  const text = character ?? ''
  if (/VQ|UQ|Q/.test(text)) return 180
  if (/Fl|Oc|Iso/.test(text)) return 700
  return 0
}
