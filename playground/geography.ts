import { addSunDisc } from './sun-disc.js'
import { atmosphere, skyTime, mapFogRange, type SkyClock } from '../src/sky.js'
import * as THREE from 'three'
import {
  celestialDirections,
  EARTH_RADIUS,
  geoToLocal,
  localFrame,
  localToGeo,
  tileCoordinate,
  tilePoint,
  tileUrl,
} from '../src/geography.js'
import type { SceneDocument, Vec3Tuple } from '../src/scene.js'
const SCALE = 1e-6
interface Tile {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>
  url: string
  texture?: THREE.Texture
  controller?: AbortController
  loading?: boolean
  failed?: boolean
  retryAt?: number
  attempts?: number
}
/** Planetary background in million-metre units; map tiles use camera-relative local metres. */
export class GeographicView {
  viewDistance = 4000
  readonly tiles = new THREE.Group()
  readonly space = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 1e-8, 200000)
  private readonly earth: THREE.Mesh
  private readonly moon: THREE.Mesh
  private readonly stars: THREE.Points
  private readonly cache = new Map<string, Tile>()
  private readonly hasTerrain: boolean
  private origin: SceneDocument['geography']
  private disposed = false
  private active = 0
  private failed = 0
  private key = ''
  private earthTexture?: THREE.Texture
  private readonly daylight = new THREE.DirectionalLight('#ffffff', 2.5)
  private readonly backdrop = new THREE.Mesh(
    new THREE.SphereGeometry(190000, 16, 12),
    new THREE.MeshBasicMaterial({
      color: '#a6bbd5',
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }),
  )
  readonly sunDirection = new THREE.Vector3()
  readonly moonDirection = new THREE.Vector3()
  atmosphere = atmosphere(0, 1)
  private lastClockSecond = -Infinity
  constructor(
    document: SceneDocument,
    private readonly changed: () => void,
    online = false,
  ) {
    this.hasTerrain = document.entities.some((e) => !!e.terrain)
    if (this.hasTerrain) online = false
    this.origin = document.geography
      ? { ...document.geography, imagery: online ? document.geography.imagery : 'offline' }
      : undefined
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry((EARTH_RADIUS + (this.origin?.altitude ?? 0)) * SCALE, 128, 96),
      new THREE.MeshLambertMaterial({ color: '#c4d8e9' }),
    )
    this.space.add(this.earth)
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(1.7374, 32, 24),
      new THREE.MeshLambertMaterial({ color: '#c5c4bd', fog: false }),
    )
    addSunDisc(this.backdrop.material, this.sunDirection)
    this.space.add(this.moon, new THREE.AmbientLight('#a2b6d3', 0.35))
    const rotation = this.origin ? localFrame(this.origin).invert() : new THREE.Quaternion()
    this.space.add(this.daylight, this.backdrop)
    this.backdrop.renderOrder = -100
    this.earth.quaternion.copy(rotation)
    this.earth.position.set(0, -(EARTH_RADIUS + (this.origin?.altitude ?? 0)) * SCALE, 0)
    const points: number[] = []
    for (let i = 0; i < 1600; i++) {
      const y = 1 - (2 * (i + 0.5)) / 1600,
        a = i * 2.3999632297
      points.push(
        Math.cos(a) * Math.sqrt(1 - y * y) * 80000,
        y * 80000,
        Math.sin(a) * Math.sqrt(1 - y * y) * 80000,
      )
    }
    const geometry = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points, 3),
    )
    this.stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 1.2,
        sizeAttenuation: false,
        color: '#c3d5ff',
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    )
    this.space.add(this.stars)
    new THREE.TextureLoader().load(
      '/geography/earth.jpg',
      (texture) => {
        if (this.disposed) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        this.earthTexture = texture
        const material = this.earth.material as THREE.MeshLambertMaterial
        material.color.set('#ffffff')
        material.map = texture
        material.needsUpdate = true
        this.changed()
      },
      undefined,
      () => this.changed(),
    )
  }
  get enabled() {
    return Boolean(this.origin)
  }
  get status(): string {
    if (!this.origin) return 'Escena sin ubicación'
    if (this.hasTerrain) return 'OSM + relieve Esri · mundo conectado'
    if (this.origin.imagery === 'offline') return 'Mapa sin conexión · Tierra local'
    if (this.active) return 'Cargando mapa…'
    if (this.failed) return 'Mapa parcial · algunas imágenes no disponibles'
    return this.origin.imagery === 'satellite'
      ? 'Esri · imágenes satélite'
      : 'CARTO · OpenStreetMap'
  }
  update(position: Vec3Tuple, renderOrigin: THREE.Vector3, clock?: SkyClock): number {
    if (!this.origin) return 0
    const point = localToGeo(this.origin, position)
    const height = Math.max(0, point.altitude - this.origin.altitude)
    const at = skyTime(clock),
      second = Math.floor(at.getTime() / 1000)
    if (second !== this.lastClockSecond) {
      this.lastClockSecond = second
      const dirs = celestialDirections(at),
        rotation = localFrame(this.origin).invert()
      this.sunDirection.copy(dirs.sun).applyQuaternion(rotation)
      this.moonDirection.copy(dirs.moon).applyQuaternion(rotation)
      this.daylight.position.copy(this.sunDirection)
      this.moon.position.copy(this.moonDirection).multiplyScalar(384.4).add(this.earth.position)
      this.changed()
    }
    const radial = new THREE.Vector3(...position)
      .add(new THREE.Vector3(0, EARTH_RADIUS + this.origin.altitude, 0))
      .normalize()
    this.atmosphere = atmosphere(
      height,
      this.sunDirection.dot(radial),
      this.hasTerrain ? this.viewDistance : 220,
    )
    const air = this.atmosphere
    if (this.hasTerrain && height < 12000) {
      Object.assign(air, mapFogRange(height, this.viewDistance))
    }
    this.backdrop.material.color.copy(air.color)
    this.space.background = null
    // Same fog in local metres and planetary units prevents the remote globe forming a second horizon.
    this.space.fog =
      air.space >= 1 ? null : new THREE.Fog(air.color, air.near * SCALE, air.far * SCALE)
    ;(this.stars.material as THREE.PointsMaterial).opacity = air.stars
    for (const tile of this.cache.values())
      tile.mesh.material.color.setScalar(0.12 + air.day * 0.88)
    this.tiles.position.copy(renderOrigin).negate()
    const zoom = THREE.MathUtils.clamp(
      Math.floor(
        Math.log2(
          (40075016 * Math.max(0.09, Math.cos((point.latitude * Math.PI) / 180))) /
            Math.max(150, height * 1.4),
        ),
      ),
      2,
      18,
    )
    const centre = tileCoordinate(point.latitude, point.longitude, zoom)
    const key = `${zoom}/${Math.floor(centre.x)}/${Math.floor(centre.y)}`
    if (key !== this.key && this.origin.imagery !== 'offline') {
      this.key = key
      const wanted = new Set<string>()
      for (const z of [...new Set([Math.max(0, zoom - 3), zoom])]) {
        const c = tileCoordinate(point.latitude, point.longitude, z),
          n = 2 ** z
        for (let dx = -2; dx <= 2; dx++)
          for (let dy = -2; dy <= 2; dy++) {
            const x = Math.floor(c.x) + dx,
              y = Math.floor(c.y) + dy
            if (y < 0 || y >= n) continue
            const key = `${z}/${((x % n) + n) % n}/${y}`
            wanted.add(key)
            if (!this.cache.has(key)) this.addTile(key, x, y, z)
          }
      }
      for (const [key, tile] of this.cache)
        if (!wanted.has(key)) {
          tile.controller?.abort()
          tile.mesh.removeFromParent()
          tile.mesh.geometry.dispose()
          tile.mesh.material.dispose()
          tile.texture?.dispose()
          this.cache.delete(key)
        }
      this.failed = [...this.cache.values()].filter((t) => t.failed).length
    }
    if (this.origin.imagery !== 'offline') this.loadNext()
    return height
  }
  private addTile(key: string, x: number, y: number, zoom: number) {
    const centre = geoToLocal(this.origin!, tilePoint(x + 0.5, y + 0.5, zoom))
    const geometry = new THREE.PlaneGeometry(1, 1, 12, 12)
    const positions = geometry.getAttribute('position'),
      uv = geometry.getAttribute('uv')
    for (let i = 0; i < positions.count; i++) {
      const point = tilePoint(x + uv.getX(i), y + 1 - uv.getY(i), zoom)
      point.altitude = this.origin!.altitude - 0.06 - (18 - zoom) * 0.025
      const p = geoToLocal(this.origin!, point)
      positions.setXYZ(i, p[0] - centre[0], p[1] - centre[1], p[2] - centre[2])
    }
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }),
    )
    mesh.position.fromArray(centre)
    mesh.visible = false
    this.tiles.add(mesh)
    this.cache.set(key, {
      mesh,
      url: tileUrl(this.origin!.imagery as 'satellite' | 'streets', zoom, x, y),
    })
  }
  private loadNext() {
    if (this.disposed) return
    for (const tile of this.cache.values()) {
      if (this.active >= 4) break
      if (tile.texture || tile.loading || Date.now() < (tile.retryAt ?? 0)) continue
      if (tile.failed) {
        tile.failed = false
        this.failed = Math.max(0, this.failed - 1)
      }
      tile.loading = true
      tile.controller = new AbortController()
      this.active++
      const timeout = setTimeout(() => tile.controller!.abort(), 12000)
      fetch(tile.url, { signal: tile.controller.signal })
        .then((r) => {
          if (!r.ok) throw new Error('Map image unavailable')
          return r.blob()
        })
        .then((blob) => createImageBitmap(blob, { imageOrientation: 'flipY' }))
        .then((bitmap) => {
          if (this.disposed || !tile.mesh.parent) {
            bitmap.close()
            return
          }
          const texture = new THREE.Texture(bitmap)
          texture.colorSpace = THREE.SRGBColorSpace
          texture.needsUpdate = true
          texture.addEventListener('dispose', () => bitmap.close())
          tile.texture = texture
          tile.mesh.material.map = texture
          tile.mesh.material.needsUpdate = true
          tile.mesh.visible = true
        })
        .catch(() => {
          if (tile.mesh.parent && !this.disposed) {
            tile.failed = true
            tile.attempts = (tile.attempts ?? 0) + 1
            tile.retryAt = Date.now() + Math.min(60000, 5000 * 2 ** (tile.attempts - 1))
            this.failed++
          }
        })
        .finally(() => {
          clearTimeout(timeout)
          tile.loading = false
          this.active--
          this.changed()
          this.loadNext()
        })
    }
  }
  render(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    worldPosition: THREE.Vector3,
  ) {
    if (!this.origin) return
    this.camera.fov = camera.fov
    this.camera.aspect = camera.aspect
    this.camera.updateProjectionMatrix()
    this.camera.position.copy(worldPosition).multiplyScalar(SCALE)
    this.camera.quaternion.copy(camera.quaternion)
    this.backdrop.position.copy(this.camera.position)
    renderer.render(this.space, this.camera)
  }
  dispose() {
    this.disposed = true
    for (const tile of this.cache.values()) {
      tile.controller?.abort()
      tile.texture?.dispose()
      tile.mesh.geometry.dispose()
      tile.mesh.material.dispose()
    }
    this.cache.clear()
    this.tiles.removeFromParent()
    this.earthTexture?.dispose()
    this.space.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose()
        o.material.dispose()
      }
    })
  }
}
