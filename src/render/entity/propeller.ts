import * as THREE from 'three'

const CUT = -1.92

/** The published Cessna is one mesh. The disc ahead of the cowling becomes its own pivot. */
export function mountPropeller(root: THREE.Object3D): THREE.Object3D | null {
  let mesh: THREE.Mesh | undefined
  root.traverse((object) => {
    if (!mesh && object instanceof THREE.Mesh) mesh = object
  })
  const source = mesh?.geometry
  if (!mesh || !source?.index || !source.attributes.position) return null
  const index = source.index
  const position = source.attributes.position
  const prop: number[] = []
  const body: number[] = []
  const vertex = new THREE.Vector3()
  for (let triangle = 0; triangle < index.count; triangle += 3) {
    let ahead = 0
    for (let k = 0; k < 3; k++) {
      vertex.fromBufferAttribute(position, index.getX(triangle + k))
      if (vertex.z < CUT) ahead++
    }
    ;(ahead === 3 ? prop : body).push(triangle)
  }
  if (prop.length < 8 || !body.length) return null
  const propGeometry = slice(source, prop)
  const bodyGeometry = slice(source, body)
  mesh.geometry = bodyGeometry
  mesh.userData.sharedAssetGeometry = false
  const blades = new THREE.Mesh(propGeometry, cloneMaterial(mesh.material))
  blades.castShadow = mesh.castShadow
  blades.receiveShadow = mesh.receiveShadow
  blades.userData.sharedAssetGeometry = false
  const center = new THREE.Vector3()
  propGeometry.computeBoundingBox()
  propGeometry.boundingBox!.getCenter(center)
  const pivot = new THREE.Group()
  pivot.name = 'Propeller'
  pivot.position.set(0, center.y, center.z)
  blades.position.set(0, -center.y, -center.z)
  mesh.parent!.add(pivot)
  pivot.add(blades)
  return pivot
}

function cloneMaterial(
  material: THREE.Material | THREE.Material[],
): THREE.Material | THREE.Material[] {
  return Array.isArray(material) ? material.map((entry) => entry.clone()) : material.clone()
}

function slice(source: THREE.BufferGeometry, triangles: number[]): THREE.BufferGeometry {
  const index = source.index!
  const map = new Map<number, number>()
  const indices: number[] = []
  const remap = (old: number) => {
    let next = map.get(old)
    if (next === undefined) {
      next = map.size
      map.set(old, next)
    }
    return next
  }
  for (const triangle of triangles)
    for (let k = 0; k < 3; k++) indices.push(remap(index.getX(triangle + k)))
  const order = [...map.entries()].sort((a, b) => a[1] - b[1]).map(([old]) => old)
  const geometry = new THREE.BufferGeometry()
  for (const name of Object.keys(source.attributes)) {
    const attribute = source.attributes[name]
    const stride = attribute.itemSize
    const values = new Float32Array(order.length * stride)
    for (let i = 0; i < order.length; i++)
      for (let k = 0; k < stride; k++) values[i * stride + k] = attribute.getComponent(order[i], k)
    geometry.setAttribute(name, new THREE.BufferAttribute(values, stride, attribute.normalized))
  }
  geometry.setIndex(indices)
  return geometry
}
