import * as THREE from 'three'

/** Interior trim follows the existing carrier collision shell; dimensions are metres. */
export function carrierInterior(): { room: THREE.Group; screens: THREE.Mesh[]; nose: THREE.Mesh } {
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
        emissive: color,
        emissiveIntensity: 0.18,
      }),
    )
    mesh.position.set(...position)
    mesh.receiveShadow = true
    room.add(mesh)
    return mesh
  }
  panel([4.77, 0.018, 9.8], [0, -0.889, 0], '#384553')
  panel([4.77, 0.025, 9.8], [0, 2.035, 0], '#d1dae2')
  for (const x of [-2.385, 2.385]) {
    panel([0.025, 2.91, 9.8], [x, 0.57, 0], '#8195a6')
    for (const z of [-4, -2, 0, 2, 4]) panel([0.055, 2.88, 0.055], [x, 0.57, z], '#283949')
    const light = panel([0.035, 0.045, 9.5], [x * 0.985, 1.82, 0], '#8ebaff')
    ;(light.material as THREE.MeshStandardMaterial).emissive.set('#8ebaff')
    ;(light.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.8
  }
  // Keep the bow, stern, ramp and central doorway open.
  for (const x of [-1.5, 1.5]) panel([1.75, 2.82, 0.065], [x, 0.58, 0], '#768b9b')
  panel([1.2, 0.72, 0.065], [0, 1.65, 0], '#768b9b')
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
  panel([2.55, 0.72, 0.018], [0, 0.78, -3.72], '#050608')
  const nose = new THREE.Mesh(
    new THREE.PlaneGeometry(2.49, 0.66),
    new THREE.MeshBasicMaterial({ color: '#111820' }),
  )
  nose.position.set(0, 0.78, -3.709)
  room.add(nose)
  return { room, screens, nose }
}
