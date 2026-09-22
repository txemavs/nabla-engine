import * as THREE from 'three'

/** Interior trim follows the existing carrier collision shell; dimensions are metres. */
export function carrierInterior(): { room: THREE.Group; screens: THREE.Mesh[]; touch: THREE.Mesh } {
  const room = new THREE.Group()
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
  const atlas = new THREE.TextureLoader().load('/world/room-skin.jpg')
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
    skin(panel([0.025, 2.91, 9.8], [x, 0.57, 0], '#35404d'), [147, 2, 365, 137])
    for (const z of [-4, -2, 0, 2, 4]) panel([0.055, 2.88, 0.055], [x, 0.57, z], '#283949')
    const light = panel([0.035, 0.045, 9.5], [x * 0.985, 1.82, 0], '#8ebaff')
    ;(light.material as THREE.MeshStandardMaterial).emissive.set('#8ebaff')
    ;(light.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8
  }
  // The stern and central doorway stay open; the bow has a physical window.
  for (const x of [-1.5, 1.5]) panel([1.75, 2.82, 0.065], [x, 0.58, 0], '#303b48')
  panel([1.2, 0.72, 0.065], [0, 1.65, 0], '#303b48')
  const screens = [-0.78, 0, 0.78].map((x) => {
    panel([0.66, 0.38, 0.008], [x, 0.175, -3.711], '#050608')
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.34),
      new THREE.MeshBasicMaterial({ color: '#030405' }),
    )
    screen.position.set(x, 0.175, -3.706)
    room.add(screen)
    return screen
  })
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
  panel([2.49, 0.008, 0.6], [0, 0.016, -3.43], '#050608')
  const touch = new THREE.Mesh(
    new THREE.PlaneGeometry(2.43, 0.54),
    new THREE.MeshBasicMaterial({ color: '#030405' }),
  )
  touch.rotation.x = -Math.PI / 2
  touch.position.set(0, 0.0202, -3.43)
  room.add(touch)
  return { room, screens, touch }
}
