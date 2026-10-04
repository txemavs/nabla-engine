import { mapCache } from '../render/planet/cache.js'
export { mapCacheStats, setMapCacheBudget, clearMapCache } from '../render/planet/cache.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'meshoptimizer'
import { GeographicView } from '../render/planet/sky.js'
import {
  WorldEnvironment,
  configureWorldRenderer,
  PLANET_DEFAULTS,
} from '../render/planet/world-environment.js'
import { geoToLocal, localToGeo, localFrame, type GeoPoint } from '../math/geo/sphere.js'
export { PLANET_DEFAULTS } from '../render/planet/world-environment.js'
export type { GeoPoint } from '../math/geo/sphere.js'
export interface GeographicCamera extends GeoPoint {
  heading: number
  pitch: number
}
export interface ViewerEnvironment {
  at?: string
  sky?: boolean
  sun?: boolean
  moon?: boolean
  clouds?: boolean
  cloudAmount?: number
  sea?: boolean
  seaLevel?: number
  viewDistance?: number
}
export interface GeographicAsset {
  id: string
  url: string
  origin: GeoPoint
  visible?: boolean
  /** Display colour for untextured meshes; textured materials retain their appearance. */
  untexturedColor?: string
}
export interface GeographicViewerOptions {
  origin: GeoPoint
  camera?: GeographicCamera
  onCameraChange?: (camera: GeographicCamera) => void
}
export interface GeographicViewer {
  loadGlb(asset: GeographicAsset): Promise<void>
  removeGlb(id: string): void
  setVisible(id: string, visible: boolean): void
  /** Replace UV surface imagery in place; null restores the original material. Caller owns the canvas. */
  setSurfaceImage(id: string, image: HTMLCanvasElement | null): void
  frame(ids?: string[]): void
  ground(): boolean
  setMouseSensitivity(value: number): void
  getCamera(): GeographicCamera
  setCamera(camera: GeographicCamera): void
  setEnvironment(environment: ViewerEnvironment): void
  setActive(active: boolean): void
  resize(): void
  dispose(): void
}
function checkPoint(point: GeoPoint) {
  if (
    ![point.latitude, point.longitude, point.altitude].every(Number.isFinite) ||
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180
  )
    throw new Error('Invalid geographic coordinate')
}
/** Transform a local east/up/south asset into a shared spherical Engine frame. */
export function geographicAssetTransform(origin: GeoPoint, assetOrigin: GeoPoint): THREE.Matrix4 {
  checkPoint(origin)
  checkPoint(assetOrigin)
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...geoToLocal(origin, assetOrigin)),
    localFrame(origin).invert().multiply(localFrame(assetOrigin)),
    new THREE.Vector3(1, 1, 1),
  )
}
function release(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>()
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return
    geometries.add(object.geometry)
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material)
      for (const value of Object.values(material))
        if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  for (const texture of textures) {
    const data = texture.source.data
    if (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) data.close()
    texture.dispose()
  }
  for (const material of materials) material.dispose()
  for (const geometry of geometries) geometry.dispose()
  root.removeFromParent()
}
/** Browser-only, framework-independent GLB inspector. No world-cache, workers or online basemap. */
export function createGeographicViewer(
  container: HTMLElement,
  options: GeographicViewerOptions,
): GeographicViewer {
  checkPoint(options.origin)
  const origin = { ...options.origin },
    scene = new THREE.Scene()
  const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  configureWorldRenderer(renderer)

  renderer.autoClear = false
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none'
  renderer.domElement.setAttribute('aria-label', 'Nabla Engine geographic 3D viewer')
  container.append(renderer.domElement)
  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 1000000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.minDistance = 0.1
  controls.enableZoom = true
  controls.zoomToCursor = true
  controls.zoomSpeed = 1.5
  controls.dampingFactor = 0.12
  controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN
  controls.screenSpacePanning = true
  renderer.domElement.tabIndex = 0
  controls.maxDistance = 200000
  let mouseSensitivity = 0.35
  function setMouseSensitivity(value: number) {
    if (!Number.isFinite(value) || value < 0.1 || value > 2) throw new Error('Mouse sensitivity must be between 0.1 and 2')
    mouseSensitivity = value
    controls.zoomSpeed = value
    controls.rotateSpeed = value
    controls.panSpeed = value
  }
  setMouseSensitivity(mouseSensitivity)
  const sky = new GeographicView(
    {
      version: 1,
      name: 'Geographic viewer',
      entities: [],
      geography: { ...origin, imagery: 'offline', planetary: true },
    },
    () => {},
    false,
    { textures: true },
  )
  const ambient = new THREE.AmbientLight('#dce7f5', 0.22),
    sun = new THREE.DirectionalLight('#fff5df', 2.5)
  scene.add(ambient, sun, sky.lensFlare)
  const worldEnvironment = new WorldEnvironment(scene, sun, ambient)
  const renderOrigin = new THREE.Vector3()
  const assets = new Map<string, THREE.Group>(),
    pending = new Map<string, AbortController>()
  const assetBounds = new Map<string, THREE.Box3>()
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  let disposed = false,
    active = true,
    animation = 0,
    environment: ViewerEnvironment = { ...PLANET_DEFAULTS },
    previous = ''
  function getCamera(): GeographicCamera {
    const point = localToGeo(origin, camera.position.toArray())
    const direction = camera
      .getWorldDirection(new THREE.Vector3())
      .applyQuaternion(localFrame(origin))
      .applyQuaternion(localFrame(point).invert())
    return {
      ...point,
      heading: (THREE.MathUtils.radToDeg(Math.atan2(direction.x, -direction.z)) + 360) % 360,
      pitch: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1))),
    }
  }
  function setCamera(value: GeographicCamera) {
    checkPoint(value)
    if (![value.heading, value.pitch].every(Number.isFinite) || Math.abs(value.pitch) > 90)
      throw new Error('Invalid camera orientation')
    const distance = Math.max(100, camera.position.distanceTo(controls.target)),
      h = THREE.MathUtils.degToRad(value.heading),
      p = THREE.MathUtils.degToRad(value.pitch)
    const direction = new THREE.Vector3(
      Math.sin(h) * Math.cos(p),
      Math.sin(p),
      -Math.cos(h) * Math.cos(p),
    )
      .applyQuaternion(localFrame(value))
      .applyQuaternion(localFrame(origin).invert())
    camera.position.fromArray(geoToLocal(origin, value))
    controls.target.copy(camera.position).addScaledVector(direction, distance)
    camera.lookAt(controls.target)
    controls.update()
  }
  function resize() {
    if (disposed) return
    const width = Math.max(1, container.clientWidth),
      height = Math.max(1, container.clientHeight)
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }
  const surfaceOverrides = new Map<string, { texture: THREE.CanvasTexture; restore: (() => void)[] }>()
  function clearSurface(id: string) {
    const override = surfaceOverrides.get(id)
    if (!override) return
    for (const restore of override.restore) restore()
    override.texture.dispose()
    surfaceOverrides.delete(id)
  }
  function setSurfaceImage(id: string, image: HTMLCanvasElement | null) {
    clearSurface(id)
    const asset = assets.get(id)
    if (!image || !asset || disposed) return
    const texture = new THREE.CanvasTexture(image)
    texture.flipY = false // GLTF UVs: top row is v=0.
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
    const restore: (() => void)[] = []
    asset.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !object.geometry.getAttribute('uv')) return
      const original = object.material
      const clones = (Array.isArray(original) ? original : [original]).map((material) => {
        const copy = material.clone()
        if ('map' in copy) {
          (copy as THREE.MeshStandardMaterial).map = texture
          if ('color' in copy) (copy as THREE.MeshStandardMaterial).color.set(0xffffff)
          copy.needsUpdate = true
        }
        return copy
      })
      object.material = Array.isArray(original) ? clones : clones[0]
      restore.push(() => { object.material = original; for (const material of clones) material.dispose() })
    })
    surfaceOverrides.set(id, { texture, restore })
  }
  function removeGlb(id: string) {
    clearSurface(id)
    pending.get(id)?.abort()
    pending.delete(id)
    const asset = assets.get(id)
    if (asset) release(asset)
    assets.delete(id)
    assetBounds.delete(id)
  }
  function setEnvironment(value: ViewerEnvironment) {
    if (value.at !== undefined && !Number.isFinite(Date.parse(value.at)))
      throw new Error('Invalid environment date')
    if (
      value.cloudAmount !== undefined &&
      (!Number.isFinite(value.cloudAmount) || value.cloudAmount < 0 || value.cloudAmount > 1)
    )
      throw new Error('Cloud amount must be between 0 and 1')
    if (
      value.seaLevel !== undefined &&
      (!Number.isFinite(value.seaLevel) || value.seaLevel < -5 || value.seaLevel > 50)
    )
      throw new Error('Sea level must be between -5 and 50 metres')
    if (
      value.viewDistance !== undefined &&
      (!Number.isFinite(value.viewDistance) ||
        value.viewDistance < 100 ||
        value.viewDistance > 1000000)
    )
      throw new Error('View distance must be between 100 and 1000000 metres')
    environment = { ...environment, ...value }
    worldEnvironment.ocean.setLevel(environment.seaLevel ?? 0)
    sky.setLayers({
      sky: environment.sky !== false,
      planets: environment.sky !== false,
      moon: environment.moon !== false,
      sun: environment.sun !== false,
      clouds: environment.clouds !== false,
    })
    sky.setCloudWeather(environment.cloudAmount ?? 0.35, 0)
  }
  function frame(ids?: string[]) {
    const bounds = new THREE.Box3()
    for (const [id, asset] of assets)
      if (asset.visible && (!ids || ids.includes(id)))
        bounds.union(new THREE.Box3().setFromObject(asset))
    if (bounds.isEmpty()) return
    const center = bounds.getCenter(new THREE.Vector3()),
      radius = Math.max(5, bounds.getSize(new THREE.Vector3()).length() / 2)
    const halfFov = Math.atan(
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * Math.min(1, camera.aspect),
    )
    controls.target.copy(center)
    camera.position
      .copy(center)
      .addScaledVector(
        new THREE.Vector3(0.4, 0.8, 1).normalize(),
        (radius / Math.sin(halfFov)) * 1.15,
      )
    camera.lookAt(center)
    controls.update()
  }
  async function loadGlb(asset: GeographicAsset) {
    if (disposed) throw new Error('Viewer disposed')
    checkPoint(asset.origin)
    if (!asset.id) throw new Error('Asset id required')
    removeGlb(asset.id)
    const controller = new AbortController()
    pending.set(asset.id, controller)
    try {
      // Atlas includes the content hash in this URL: a rebuilt section gets a new cache key.
      // Unversioned URLs are fetched normally to avoid keeping mutable assets indefinitely.
      const cache = new URL(asset.url, window.location.href).searchParams.has('version') ? mapCache('geographic-glb') : undefined
      let response: Response | undefined
      try { response = await cache?.match(asset.url) } catch { /* Storage unavailable: use network. */ }
      if (controller.signal.aborted || disposed) return
      const cached = Boolean(response)
      response ??= await fetch(asset.url, { signal: controller.signal })
      if (!response.ok) throw new Error(`GLB request failed (${response.status})`)
      const data = await response.arrayBuffer()
      if (!cached && cache && data.byteLength >= 12 && new DataView(data).getUint32(0, true) === 0x46546c67) {
        try { await cache.put(asset.url, new Response(data, { headers: { 'Content-Type': 'model/gltf-binary' } })) }
        catch { /* Quota or private mode must not prevent viewing the downloaded GLB. */ }
      }
      if (controller.signal.aborted || disposed) return
      const gltf = await loader.parseAsync(
        data,
        new URL('.', new URL(asset.url, window.location.href)).href,
      )
      if (controller.signal.aborted || disposed) {
        for (const root of gltf.scenes) release(root)
        return
      }
      const group = new THREE.Group()
      group.name = asset.id
      group.applyMatrix4(geographicAssetTransform(origin, asset.origin))
      if (asset.untexturedColor) gltf.scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material instanceof THREE.MeshStandardMaterial && !material.map)
            material.color.set(asset.untexturedColor!)
        }
      })
      group.add(gltf.scene)
      group.visible = asset.visible !== false
      assets.set(asset.id, group)
      scene.add(group)
      group.updateMatrixWorld(true)
      assetBounds.set(asset.id, new THREE.Box3().setFromObject(group))
    } catch (error) {
      if (!controller.signal.aborted) throw error
    } finally {
      if (pending.get(asset.id) === controller) pending.delete(asset.id)
    }
  }
  // Focus-scoped navigation: never consume shortcuts from surrounding editors.
  const keys = new Set<string>()
  const canvas = renderer.domElement
  const inputLifetime = new AbortController()
  const inputOptions = { signal: inputLifetime.signal }
  const ray = new THREE.Raycaster()
  const direction = new THREE.Vector3()
  function nearestHit() {
    const candidates = [...assets.entries()].filter(([id, a]) => a.visible && ray.ray.intersectsBox(assetBounds.get(id)!)).map(([, a]) => a)
    return ray.intersectObjects(candidates, true)[0]
  }
  function translate(delta: THREE.Vector3) {
    const length = delta.length()
    if (!length) return
    ray.set(camera.position, delta.clone().normalize())
    ray.far = length + 1
    const hit = nearestHit()
    if (hit) delta.setLength(Math.max(0, Math.min(length, hit.distance - 1)))
    camera.position.add(delta)
    controls.target.add(delta)
    controls.update()
  }
  let clearance = 100, clearanceAt = 0
  function upDirection() {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(localFrame(getCamera())).applyQuaternion(localFrame(origin).invert())
  }
  function groundHit() {
    ray.set(camera.position, upDirection().negate())
    ray.far = 1000000
    return nearestHit()
  }
  function ground() {
    let hit = groundHit()
    if (!hit) {
      const up = upDirection()
      ray.set(controls.target.clone().addScaledVector(up, 100000), up.negate())
      ray.far = 200000
      hit = nearestHit()
    }
    if (!hit) return false
    const pose = getCamera()
    const position = hit.point.clone().addScaledVector(upDirection(), 1.7)
    setCamera({ ...localToGeo(origin, position.toArray()), heading: pose.heading, pitch: -3 })
    clearance = 1.7; clearanceAt = performance.now()
    return true
  }
  function speed() {
    if (performance.now() - clearanceAt > 250) {
      clearance = groundHit()?.distance ?? Math.max(10, Math.abs(getCamera().altitude))
      clearanceAt = performance.now()
    }
    return THREE.MathUtils.clamp(clearance * 0.8, 4, 5000) * (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 4 : 1)
  }
  let looking: { id: number; x: number; y: number } | undefined
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 2 || !active) return
    event.stopImmediatePropagation(); event.preventDefault()
    canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId)
    controls.enabled = false
    looking = { id: event.pointerId, x: event.clientX, y: event.clientY }
  }, { ...inputOptions, capture: true })
  canvas.addEventListener('pointermove', event => {
    if (!looking || looking.id !== event.pointerId) return
    const pose = getCamera()
    setCamera({ ...pose, heading: pose.heading + (event.clientX - looking.x) * 0.18 * mouseSensitivity,
      pitch: THREE.MathUtils.clamp(pose.pitch - (event.clientY - looking.y) * 0.18 * mouseSensitivity, -89, 89) })
    looking.x = event.clientX; looking.y = event.clientY
  }, inputOptions)
  function endLook() { looking = undefined; controls.enabled = active }
  canvas.addEventListener('pointerup', endLook, inputOptions)
  canvas.addEventListener('pointercancel', endLook, inputOptions)
  canvas.addEventListener('lostpointercapture', endLook, inputOptions)
  canvas.addEventListener('blur', endLook, inputOptions)
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }), inputOptions)
  canvas.addEventListener('keydown', event => {
    if (!active || event.ctrlKey || event.metaKey || event.altKey) return
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault(); keys.add(event.code)
    }
  }, inputOptions)
  canvas.addEventListener('keyup', event => keys.delete(event.code), inputOptions)
  canvas.addEventListener('blur', () => keys.clear(), inputOptions)
  window.addEventListener('blur', () => keys.clear(), inputOptions)
  let lastNavigation = performance.now()
  function navigate() {
    const now = performance.now(), dt = Math.min(0.05, (now - lastNavigation) / 1000)
    lastNavigation = now
    if (!keys.size) return
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(localFrame(getCamera())).applyQuaternion(localFrame(origin).invert())
    camera.getWorldDirection(direction)
    if (direction.lengthSq() < 0.000001) direction.set(0, 0, -1).projectOnPlane(up)
    direction.normalize()
    const right = direction.clone().cross(up).normalize()
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'))
    const sideways = Number(keys.has('KeyD')) - Number(keys.has('KeyA'))
    const lift = Number(keys.has('KeyE')) - Number(keys.has('KeyQ'))
    const movement = direction.multiplyScalar(forward).addScaledVector(right, sideways).addScaledVector(up, lift)
    if (movement.lengthSq()) translate(movement.normalize().multiplyScalar(speed() * dt))
  }
  const observer = new ResizeObserver(resize)
  observer.observe(container)
  setCamera(
    options.camera ?? { ...origin, altitude: origin.altitude + 1200, heading: 0, pitch: -45 },
  )
  setEnvironment(environment)
  resize()
  function tick() {
    if (disposed || !active) return
    animation = requestAnimationFrame(tick)
    navigate()
    controls.update()
    const distance = environment.viewDistance ?? 80000
    worldEnvironment.updateSea(
      origin,
      camera.position,
      renderOrigin,
      distance,
      performance.now(),
      environment.sea !== false,
    )
    worldEnvironment.updateSky(
      sky,
      camera.position,
      renderOrigin,
      environment.at ? { mode: 'fixed', at: environment.at } : { mode: 'live' },
      distance,
    )
    worldEnvironment.applyLighting(sky, environment.sun !== false, environment.moon !== false)
    renderer.domElement.dataset.seaLevel = String(environment.seaLevel ?? 0)
    renderer.domElement.dataset.moon = environment.moon !== false ? 'on' : 'off'
    renderer.domElement.dataset.exposure = String(renderer.toneMappingExposure)
    renderer.domElement.dataset.sea = worldEnvironment.ocean.mesh.visible ? 'sheet' : 'off'
    renderer.domElement.dataset.skyPhase =
      sky.atmosphere.day > 0.8 ? 'day' : sky.atmosphere.day < 0.1 ? 'night' : 'twilight'
    renderer.setClearColor('#101923')
    renderer.clear()
    sky.render(renderer, camera, camera.position)
    renderer.clearDepth()
    renderer.render(scene, camera)
    sky.renderClouds(renderer, camera)
    const state = getCamera(),
      key = JSON.stringify(state)
    if (key !== previous) {
      previous = key
      options.onCameraChange?.(state)
    }
  }
  tick()
  return {
    loadGlb,
    setSurfaceImage,
    removeGlb,
    setVisible(id, visible) {
      const asset = assets.get(id)
      if (asset) asset.visible = visible
    },
    frame,
    ground,
    setMouseSensitivity,
    getCamera,
    setCamera,
    setEnvironment,
    resize,
    setActive(value) {
      if (disposed || active === value) return
      active = value
      keys.clear()
      endLook()
      lastNavigation = performance.now()
      if (active) {
        resize()
        tick()
      } else cancelAnimationFrame(animation)
    },
    dispose() {
      if (disposed) return
      disposed = true
      cancelAnimationFrame(animation)
      observer.disconnect()
      inputLifetime.abort()
      controls.dispose()
      for (const id of new Set([...assets.keys(), ...pending.keys()])) removeGlb(id)
      worldEnvironment.dispose()
      sky.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
