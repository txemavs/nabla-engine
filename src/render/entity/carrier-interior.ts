import * as THREE from 'three'
import type { VehicleDefinition } from '../../entity/vehicle/field.js'

/** Interior trim follows the existing carrier collision shell; dimensions are metres. */
export function carrierInterior(mounts: VehicleDefinition['monitorMounts']): {
  room: THREE.Group
  screens: THREE.Mesh[]
  door: THREE.Mesh[]
  touch: THREE.Mesh
} {
  if (!mounts) throw new Error('Carrier requires GLB-generated monitor mounts; reload its preset')
  const room = new THREE.Group()
  const screenAt = (id: string) => {
    const mount = mounts.find((entry) => entry.id === id)
    if (!mount) throw new Error('Missing carrier monitor: ' + id)
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(mount.width, mount.height),
      new THREE.MeshBasicMaterial({ color: '#030405' }),
    )
    mesh.position.fromArray(mount.position)
    mesh.quaternion.fromArray(mount.rotation)
    room.add(mesh)
    return mesh
  }
  room.name = 'Carrier interior lining'
  const panel = (
    size: [number, number, number],
    position: [number, number, number],
    color: string,
  ) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...size),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        envMapIntensity: 0.15,
      }),
    )
    mesh.position.set(...position)
    mesh.receiveShadow = true
    mesh.castShadow = true
    room.add(mesh)
    return mesh
  }
  const atlas = new THREE.TextureLoader().load('/library/ships/container/room-skin.jpg')
  atlas.colorSpace = THREE.SRGBColorSpace
  let textureOwner = false
  // Sample the supplied atlas with per-face UVs, preserving the original JPEG.
  const skin = (mesh: THREE.Mesh, rect: [number, number, number, number]) => {
    if (!textureOwner) {
      ;(mesh.material as THREE.Material).addEventListener('dispose', () => atlas.dispose())
      textureOwner = true
    }
    const uv = mesh.geometry.getAttribute('uv')
    const [x, y, w, h] = rect
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (x + uv.getX(i) * w) / 1024, 1 - (y + (1 - uv.getY(i)) * h) / 512)
    ;(mesh.material as THREE.MeshStandardMaterial).map = atlas
    ;(mesh.material as THREE.MeshStandardMaterial).color.set('#aab2bc')
  }
  skin(panel([4.77, 0.018, 9.8], [0, -0.889, 0], '#384553'), [145, 146, 370, 222])
  skin(panel([4.77, 0.025, 9.8], [0, 2.035, 0], '#39434f'), [660, 150, 360, 214])
  for (const x of [-2.385, 2.385]) {
    const light = panel([0.035, 0.045, 9.5], [x * 0.985, 1.82, 0], '#8ebaff')
    light.name = 'Cabin strip'
    ;(light.material as THREE.MeshStandardMaterial).emissive.set('#8ebaff')
    ;(light.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8
  }
  // The stern and central doorway stay open; the bow has a physical window.
  for (const x of [-1.5, 1.5]) panel([1.75, 2.82, 0.065], [x, 0.58, 0], '#303b48')
  panel([1.2, 0.72, 0.065], [0, 1.65, 0], '#303b48')
  const screens = ['helm0', 'helm1', 'helm2'].map(screenAt)
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(4.71, 2.91, 0.08),
    new THREE.MeshStandardMaterial({
      color: '#72919e',
      transparent: true,
      opacity: 0.22,
      roughness: 0.22,
      metalness: 0.15,
      depthWrite: false,
      envMapIntensity: 0.35,
    }),
  )
  glass.position.set(0, 0.55, -5.05)
  room.add(glass)
  panel([2.49, 0.008, 0.44], [0, 0.016, -3.34], '#050608')
  // Same screens as the helm row, on the cabin face of the door. +X is the sitter's right.
  const door = ['door0', 'door1'].map(screenAt)
  const touch = screenAt('touch')
  return { room, screens, door, touch }
}
