import { createArtisticClouds, createGlobeClouds, shadeEarthWithClouds } from './artistic-clouds.js'
import { NightSky } from './night-sky.js'
import { cloudHours, createCloudLayer } from './clouds.js'
import { addSunDisc } from './sun-disc.js'
import { createLensFlare } from './lens-flare.js'
import { atmosphere, skyTime, mapFogRange, type SkyClock } from '../../planet/sky.js'
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
} from '../../math/geo/sphere.js'
import type { SceneDocument } from '../../scene/document.js'
import type { Vec3Tuple } from '../../entity/schema.js'
const SCALE = 1e-6
function moonMaterial(sun: THREE.Vector3): THREE.ShaderMaterial {
  const placeholder = new THREE.DataTexture(new Uint8Array([255, 248, 236]), 1, 1)
  placeholder.colorSpace = THREE.SRGBColorSpace
  placeholder.needsUpdate = true
  return new THREE.ShaderMaterial({
    uniforms: {
      sun: { value: sun },
      map: { value: placeholder },
      daylight: { value: 0 },
      skyTint: { value: new THREE.Color('#b9d5e8') },
    },
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 sun;
      uniform sampler2D map;
      uniform float daylight;
      uniform vec3 skyTint;
      varying vec3 vNormal;
      varying vec2 vUv;
      void main() {
        vec3 albedo = texture2D(map, vUv).rgb;
        float lit = smoothstep(-0.04, 0.28, dot(normalize(vNormal), normalize(sun)));
        // The atmosphere washes out lunar detail in daylight; the unlit side
        // fades into the sky instead of drawing a dark disc over it.
        float day = smoothstep(0.0, 1.0, daylight);
        float luminance = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
        vec3 nightAlbedo = mix(vec3(luminance), albedo, 0.25);
        vec3 nightColor = pow(nightAlbedo, vec3(1.12)) * (0.018 + 1.35 * lit);
        vec3 dayAlbedo = mix(vec3(0.9), vec3(luminance), 0.18);
        vec3 dayColor = mix(dayAlbedo, skyTint, 0.24);
        float opacity = mix(1.0, lit * 0.38, day);
        gl_FragColor = vec4(mix(nightColor, dayColor, day), opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
}
function createAirGlow(sun: THREE.Vector3, radius: number) {
  const material = new THREE.ShaderMaterial({
    uniforms: { sunDirection: { value: sun } },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      varying vec3 vNormal;
      varying vec3 vWorld;
      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 sun = normalize(sunDirection);
        float graz = pow(1.0 - clamp(abs(dot(N, V)), 0.0, 1.0), 3.1);
        float day = smoothstep(-0.4, 0.28, dot(N, sun));
        float intoSun = smoothstep(0.15, 0.92, dot(sun, -V));
        vec3 col = mix(vec3(0.32, 0.52, 1.0), vec3(1.0, 0.68, 0.38), intoSun);
        float glow = graz * (0.045 + day * 0.42) * (0.38 + intoSun);
        if (glow < 0.012) discard;
        gl_FragColor = vec4(col * glow, 1.0);
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 96), material)
  mesh.name = 'Air'
  mesh.frustumCulled = false
  mesh.renderOrder = 2
  return mesh
}

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
  private readonly night: NightSky
  private readonly cache = new Map<string, Tile>()
  private readonly hasTerrain: boolean
  private origin: SceneDocument['geography']
  private disposed = false
  private active = 0
  private failed = 0
  private key = ''
  private earthTexture?: THREE.Texture
  private moonTexture?: THREE.Texture
  private readonly sunDisc: { value: THREE.Color }
  private readonly clouds: ReturnType<typeof createCloudLayer>
  private readonly artistic: ReturnType<typeof createArtisticClouds>
  private readonly globe: ReturnType<typeof createGlobeClouds>
  private readonly air: THREE.Mesh
  private readonly cloudPass = new THREE.Scene()
  private moonSize = 9
  private cloudStyle: 'low' | 'artistic' = 'artistic'
  private cloudsWanted = true
  private readonly flare: ReturnType<typeof createLensFlare>
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
  private readonly moonSun = new THREE.Vector3(0, 1, 0)
  atmosphere = atmosphere(0, 1)
  private lastClockSecond = -Infinity
  constructor(
    document: SceneDocument,
    private readonly changed: () => void,
    online = false,
    options: { textures?: boolean } = {},
  ) {
    this.hasTerrain = !!document.geography?.planetary || document.entities.some((e) => !!e.terrain)
    if (this.hasTerrain) online = false
    this.origin = document.geography
      ? { ...document.geography, imagery: online ? document.geography.imagery : 'offline' }
      : undefined
    this.earth = new THREE.Mesh(
      new THREE.SphereGeometry(EARTH_RADIUS * SCALE, 128, 96),
      new THREE.MeshLambertMaterial({ color: '#c4d8e9' }),
    )
    this.space.add(this.earth)
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(1.7374, 48, 36), moonMaterial(this.moonSun))
    this.moon.scale.setScalar(this.moonSize)
    this.sunDisc = addSunDisc(this.backdrop.material, this.sunDirection)
    this.clouds = createCloudLayer(this.sunDirection)
    this.artistic = createArtisticClouds(this.sunDirection)
    this.cloudPass.add(this.artistic.deck)
    const earthRadius = EARTH_RADIUS * SCALE
    this.globe = createGlobeClouds(this.sunDirection, earthRadius + 0.02)
    shadeEarthWithClouds(
      this.earth.material as THREE.MeshLambertMaterial,
      this.sunDirection,
      this.globe.coverage,
      this.globe.dayHours,
      this.globe.amount,
    )
    this.air = createAirGlow(this.sunDirection, earthRadius + 0.14)
    this.flare = createLensFlare(this.sunDirection)
    this.space.add(this.moon)
    this.night = new NightSky()
    this.space.add(this.night.root)
    const rotation = this.origin ? localFrame(this.origin).invert() : new THREE.Quaternion()
    this.space.add(this.daylight, this.backdrop, this.clouds.mesh, this.globe.mesh, this.air)
    if (options.textures !== false)
      new THREE.TextureLoader().load(
        new URL('../../../assets/geography/moon.jpg', import.meta.url).href,
        (texture) => {
          if (this.disposed) {
            texture.dispose()
            return
          }
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = 8
          const material = this.moon.material as THREE.ShaderMaterial
          const previous = material.uniforms.map.value as THREE.Texture
          material.uniforms.map.value = texture
          previous.dispose()
          this.moonTexture = texture
          this.changed()
        },
        undefined,
        () => this.changed(),
      )
    this.syncClouds()
    this.backdrop.renderOrder = -100
    this.earth.quaternion.copy(rotation)
    this.earth.position.set(0, -(EARTH_RADIUS + (this.origin?.altitude ?? 0)) * SCALE, 0)
    this.globe.mesh.position.copy(this.earth.position)
    this.globe.mesh.quaternion.copy(rotation)
    this.air.position.copy(this.earth.position)
    if (options.textures !== false)
      new THREE.TextureLoader().load(
        new URL('../../../assets/geography/earth.jpg', import.meta.url).href,
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
    const height = Math.max(0, point.altitude)
    const at = skyTime(clock),
      second = Math.floor(at.getTime() / 1000)
    if (second !== this.lastClockSecond) {
      this.lastClockSecond = second
      const dirs = celestialDirections(at),
        rotation = localFrame(this.origin).invert()
      this.sunDirection.copy(dirs.sun).applyQuaternion(rotation)
      this.moonDirection.copy(dirs.moon).applyQuaternion(rotation)
      this.moonSun.copy(this.sunDirection)
      this.daylight.position.copy(this.sunDirection)
      this.moon.position.copy(this.moonDirection).multiplyScalar(384.4).add(this.earth.position)
      this.aimMoon(rotation)
      this.night.place(at, rotation)
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
    const lunarMaterial = this.moon.material as THREE.ShaderMaterial
    lunarMaterial.uniforms.daylight.value = air.day * (1 - air.space)
    lunarMaterial.uniforms.skyTint.value.copy(air.color)
    if (this.hasTerrain) Object.assign(air, mapFogRange(this.viewDistance))
    this.backdrop.material.color.copy(air.color)
    this.space.background = null
    // Same fog in local metres and planetary units prevents the remote globe forming a second horizon.
    this.space.fog = air.fog ? new THREE.Fog(air.color, air.near * SCALE, air.far * SCALE) : null
    this.night.opacity = air.stars
    const hours = cloudHours(at)
    const sunElev = this.sunDirection.dot(radial)
    const golden =
      (1 - THREE.MathUtils.smoothstep(sunElev, 0.05, 0.42)) *
      THREE.MathUtils.smoothstep(sunElev, -0.15, 0.02)
    this.clouds.dayHours.value = hours
    this.clouds.coverage.value = 1 - air.space
    this.artistic.dayHours.value = hours
    this.artistic.golden.value = golden
    this.artistic.day.value = air.day
    this.artistic.coverage.value = 1 - air.space
    this.artistic.cloudOrigin.value.copy(renderOrigin)
    this.globe.dayHours.value = hours
    this.globe.coverage.value = this.artistic.deck.visible ? air.space : 0
    this.applyMoonScale()
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
  setCloudStyle(style: 'low' | 'artistic') {
    this.cloudStyle = style
    this.syncClouds()
  }
  setCloudWeather(amount: number, storm: number) {
    this.artistic.setWeather(amount, storm)
    this.globe.amount.value = amount
  }
  /** Horizon magnification. High in the sky, and out in space, the moon stays at real size. */
  setMoonSize(size: number) {
    this.moonSize = Math.min(16, Math.max(1, size))
    this.applyMoonScale()
  }
  private applyMoonScale() {
    const high = THREE.MathUtils.smoothstep(this.moonDirection.y, 0, 0.5)
    const illusion = (1 - high) * (1 - this.atmosphere.space)
    this.moon.scale.setScalar(1 + (this.moonSize - 1) * illusion)
  }
  get animatingClouds() {
    return this.artistic.deck.visible && this.artistic.coverage.value > 0.04
  }
  private syncClouds() {
    const artistic = this.cloudsWanted && this.cloudStyle === 'artistic'
    this.clouds.mesh.visible = this.cloudsWanted && this.cloudStyle === 'low'
    this.artistic.deck.visible = artistic
    this.globe.mesh.visible = artistic
  }
  setLayers(layers: {
    sky: boolean
    planets: boolean
    sun: boolean
    moon?: boolean
    clouds?: boolean
  }) {
    this.backdrop.visible = layers.sky
    this.cloudsWanted = layers.sky && layers.clouds !== false && !!this.origin
    this.syncClouds()
    this.earth.visible = layers.planets
    this.air.visible = layers.sky
    this.moon.visible = layers.planets && layers.moon !== false
    this.night.root.visible = layers.planets
    this.sunDisc.value.set(layers.sun ? '#ffffff' : '#000000')
    this.flare.mesh.visible = layers.sun
  }
  render(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    worldPosition: THREE.Vector3,
  ) {
    if (!this.origin) return
    this.camera.fov = camera.fov
    this.camera.aspect = camera.aspect
    this.camera.zoom = camera.zoom
    this.camera.view = camera.view ? { ...camera.view } : null
    this.camera.updateProjectionMatrix()
    this.camera.position.copy(worldPosition).multiplyScalar(SCALE)
    this.camera.quaternion.copy(camera.quaternion)
    this.backdrop.position.copy(this.camera.position)
    this.clouds.mesh.position.copy(this.camera.position)
    this.globe.mesh.position.copy(this.earth.position)
    this.globe.mesh.quaternion.copy(this.earth.quaternion)
    this.air.position.copy(this.earth.position)
    this.flare.aspect.value = camera.aspect
    renderer.render(this.space, this.camera)
  }
  /** After the world, so the sheets composite over terrain and sea. */
  renderClouds(renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    if (!this.artistic.deck.visible || this.artistic.coverage.value < 0.02) return
    const clear = renderer.autoClear
    renderer.autoClear = false
    renderer.render(this.cloudPass, camera)
    renderer.autoClear = clear
  }
  private aimMoon(rotation: THREE.Quaternion) {
    const towardEarth = this.moonDirection.clone().negate()
    if (towardEarth.lengthSq() < 1e-6) return
    towardEarth.normalize()
    const north = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation)
    north.addScaledVector(towardEarth, -north.dot(towardEarth))
    if (north.lengthSq() < 1e-6) return
    north.normalize()
    const east = new THREE.Vector3().crossVectors(towardEarth, north).normalize()
    this.moon.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(towardEarth, north, east),
    )
  }
  /** Fullscreen pass. Parent it to the world scene so it composites with the city. */
  get lensFlare() {
    return this.flare.mesh
  }
  setViewAspect(aspect: number) {
    this.flare.aspect.value = aspect
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
    this.flare.mesh.removeFromParent()
    this.flare.dispose()
    this.artistic.deck.geometry.dispose()
    this.artistic.deck.material.dispose()
    this.earthTexture?.dispose()
    this.moonTexture?.dispose()
    this.space.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Line) {
        o.geometry.dispose()
        o.material.dispose()
      }
    })
  }
}
