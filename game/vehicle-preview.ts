/** Offline thumbnail preparation. The headset only downloads the resulting PNGs. */
import * as THREE from 'three'
import { SceneView, presetVehicle, hasVehiclePreset } from '@nabla/engine'

export const previewKinds = () => [
  's3',
  'vfr',
  'truck',
  ...(hasVehiclePreset('bmw') ? ['bmw'] : []),
  'f14',
  'forklift',
]

export async function renderVehiclePreview(kind: string): Promise<void> {
  const ids: Record<string, string> = {
    s3: 'car',
    vfr: 'vfr800',
    truck: 'white-truck',
    forklift: 'forklift-rc',
  }
  const vehicle = presetVehicle(ids[kind] ?? kind, 'preview')
  vehicle.transform.position = [0, 0, 0]
  vehicle.transform.rotation = [0, 0, 0, 1]
  const entities = [vehicle]
  if (kind === 'truck') {
    const trailer = presetVehicle('white-trailer', 'trailer')
    trailer.transform.position = new THREE.Vector3(...vehicle.vehicle!.hitch!)
      .sub(new THREE.Vector3(...trailer.vehicle!.towAnchor!))
      .toArray()
    trailer.transform.rotation = [0, 0, 0, 1]
    entities.push(trailer)
  }
  const view = new SceneView({ version: 1, name: 'Vehicle preview', entities }, false, true, {
    assetQuality: 'low',
    carInstruments: null,
  })
  await view.ready
  view.smokeEnabled = false
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#1e1e1e')
  scene.add(view.root)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x777788, 2.5))
  const light = new THREE.DirectionalLight(0xffffff, 3)
  light.position.set(-4, 8, -6)
  scene.add(light)
  // Invisible helpers and alternate meshes must not distort the thumbnail framing.
  view.root.updateWorldMatrix(true, true)
  const bounds = new THREE.Box3()
  view.root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh)) return
    object.geometry.computeBoundingBox()
    if (object.geometry.boundingBox)
      bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld))
  })
  const center = bounds.getCenter(new THREE.Vector3())
  const radius = Math.max(bounds.getSize(new THREE.Vector3()).length(), 1)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, radius * 10)
  camera.position.copy(center).add(new THREE.Vector3(-1, .65, -1.4).normalize().multiplyScalar(radius * 3))
  camera.lookAt(center)
  camera.updateMatrixWorld(true)
  const projected = new THREE.Box3()
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z])
        projected.expandByPoint(new THREE.Vector3(x,y,z).applyMatrix4(camera.matrixWorldInverse))
  const mid = projected.getCenter(new THREE.Vector3()), span = projected.getSize(new THREE.Vector3())
  const halfHeight = Math.max(span.y, span.x / (800 / 220)) * .56
  camera.left = mid.x - halfHeight * (800 / 220)
  camera.right = mid.x + halfHeight * (800 / 220)
  camera.bottom = mid.y - halfHeight
  camera.top = mid.y + halfHeight
  camera.updateProjectionMatrix()
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(800, 220)
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  document.body.replaceChildren(renderer.domElement)
  document.body.style.cssText = 'margin:0;background:#1e1e1e'
  // Frame rendered pixels: imported meshes can contain unused vertices that inflate bounds.
  scene.background = null
  renderer.render(scene, camera)
  const gl = renderer.getContext()
  const pixels = new Uint8Array(800 * 220 * 4)
  gl.readPixels(0, 0, 800, 220, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  let minX = 800, minY = 220, maxX = -1, maxY = -1
  for (let y = 0; y < 220; y++) for (let x = 0; x < 800; x++) {
    if (pixels[(y * 800 + x) * 4 + 3] < 16) continue
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  if (maxX >= minX) {
    const width = camera.right - camera.left, height = camera.top - camera.bottom
    const cx = camera.left + (minX + maxX + 1) / 1600 * width
    const cy = camera.bottom + (minY + maxY + 1) / 440 * height
    const fit = Math.max((maxX - minX + 1) / 800, (maxY - minY + 1) / 220) / .9
    camera.left = cx - width * fit / 2; camera.right = cx + width * fit / 2
    camera.bottom = cy - height * fit / 2; camera.top = cy + height * fit / 2
    camera.updateProjectionMatrix()
  }
  scene.background = new THREE.Color('#1e1e1e')
  renderer.render(scene, camera)
}
