/** Rebuild from the untouched backup directory. Paint/glass/light primitives stay exact. */
import path from 'node:path'
import { readdirSync } from 'node:fs'
import { writeA3Wheel } from './lib/a3-wheel.mjs'
import { MeshoptSimplifier } from 'meshoptimizer'
import {
  BufferGeometry,
  Float32BufferAttribute,
  BoxGeometry,
  CylinderGeometry,
  Matrix4,
  Quaternion,
  Vector3,
} from 'three'
import { readGlb, writeGlb, components } from './lib/glb.mjs'
await MeshoptSimplifier.ready
const sourceDir = process.argv[2]
if (!sourceDir) throw Error('Pass the directory containing the three original A3 GLBs')
const brand = readGlb(
  new URL('../assets/studio/ships/container/ship.container.5x10.glb', import.meta.url),
)
const bp =
  brand.json.meshes[brand.json.nodes.find((n) => n.name === 'Brand_Nabla_Proa').mesh].primitives[0]
const badge = new BufferGeometry().setAttribute(
  'position',
  new Float32BufferAttribute(brand.read(bp.attributes.POSITION).flat(), 3),
)
badge.setIndex(brand.read(bp.indices).flat())
badge.computeBoundingBox()
const centre = badge.boundingBox.getCenter(new Vector3())
badge.translate(-centre.x, -centre.y, -centre.z)
badge.computeVertexNormals()
for (const part of process.argv.includes('--wheel-only')
  ? ['wheel']
  : ['cabrio', 'wheel', 'steering']) {
  if (part === 'wheel') {
    console.log(
      'wheel',
      writeA3Wheel(new URL('../assets/studio/cars/a3/a3.wheel.glb', import.meta.url), badge),
    )
    continue
  }
  const filename = readdirSync(sourceDir).find((name) => name.endsWith(`.${part}.glb`))
  if (!filename) throw new Error(`No ${part} model in ${sourceDir}`)
  const { json: j, bin, read: oldRead } = readGlb(path.join(sourceDir, filename)),
    data = new Map()
  const read = (i) => data.get(i) || oldRead(i)
  const add = (vs, type) => {
    const i = j.accessors.length
    j.accessors.push({ type })
    data.set(i, vs)
    return i
  }
  let before = 0,
    after = 0,
    removed = 0
  for (const [mi, mesh] of j.meshes.entries())
    for (const p of mesh.primitives) {
      const name = j.materials[p.material].name,
        pos = read(p.attributes.POSITION)
      let ix = read(p.indices).flat()
      before += ix.length / 3
      if (
        (part === 'cabrio' && [4, 19].includes(mi) && name === 'Cromo 3') ||
        (part === 'steering' && p.material === 0)
      ) {
        const groups = components(pos, ix)
        ix = groups
          .filter((c) => {
            const width = c.max[0] - c.min[0],
              keep =
                part === 'cabrio'
                  ? mi === 4
                    ? width > 0.5
                    : !(width > 0.15 && width < 0.2 && c.min[1] > 0)
                  : !(c.min[0] > 0.115 && c.max[2] - c.min[2] < 0.12)
            if (!keep) removed += c.indices.length / 3
            return keep
          })
          .flatMap((c) => c.indices)
      }
      // Protect body silhouettes, lights, transparent glazing and the functional mirror lenses.
      const protectedSurface =
        part === 'cabrio' && (/Pintura|Foco|Piloto|Parabrisas/.test(name) || name === 'Llanta 2')
      if (!protectedSurface && ix.length > 300) {
        const ratio = 0.5
        const attributes = Float32Array.from(read(p.attributes.NORMAL).flat())
        const result = MeshoptSimplifier.simplifyWithAttributes(
          Uint32Array.from(ix),
          Float32Array.from(pos.flat()),
          3,
          attributes,
          3,
          [0.02, 0.02, 0.02],
          null,
          Math.max(30, Math.floor((ix.length * ratio) / 3) * 3),
          0.001,
          ['LockBorder', 'ErrorAbsolute', 'Permissive'],
        )
        ix = Array.from(result[0])
      }
      // Compact every attribute together, retaining UV/normal seams and original node transforms.
      const used = [...new Set(ix)],
        map = new Map(used.map((v, i) => [v, i]))
      for (const key in p.attributes) {
        const old = p.attributes[key],
          a = read(old)
        p.attributes[key] = add(
          used.map((i) => a[i]),
          j.accessors[old].type,
        )
      }
      p.indices = add(
        ix.map((i) => [map.get(i)]),
        'SCALAR',
      )
      after += ix.length / 3
    }
  const chrome = j.materials.length
  j.materials.push({
    name: 'Nabla silver chrome',
    pbrMetallicRoughness: {
      baseColorFactor: [0.78, 0.81, 0.85, 1],
      metallicFactor: 0.85,
      roughnessFactor: 0.2,
    },
  })
  const liner = j.materials.length
  j.materials.push({
    name: 'A3 inner light seal',
    doubleSided: true,
    pbrMetallicRoughness: {
      baseColorFactor: [0.018, 0.022, 0.028, 1],
      metallicFactor: 0,
      roughnessFactor: 0.85,
    },
  })
  function append(name, geometry, material) {
    if (!geometry.index)
      geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i))
    const attributes = {}
    for (const key of ['position', 'normal', 'uv'])
      if (geometry.attributes[key]) {
        const a = geometry.attributes[key],
          vs = Array.from({ length: a.count }, (_, i) =>
            Array.from({ length: a.itemSize }, (_, k) => a.array[i * a.itemSize + k]),
          )
        attributes[{ position: 'POSITION', normal: 'NORMAL', uv: 'TEXCOORD_0' }[key]] = add(
          vs,
          'VEC' + a.itemSize,
        )
      }
    const mesh = j.meshes.length
    j.meshes.push({
      name,
      primitives: [
        {
          attributes,
          indices: add(
            Array.from(geometry.index.array, (i) => [i]),
            'SCALAR',
          ),
          material,
        },
      ],
    })
    const node = j.nodes.length
    j.nodes.push({ name, mesh })
    j.scenes[j.scene || 0].nodes.push(node)
    after += geometry.index.count / 3
    geometry.dispose()
  }
  function emblem(name, width, rotation, position) {
    const g = badge.clone()
    g.scale(width / 0.13318918645, width / 0.13318918645, width / 0.13318918645)
    g.rotateY(rotation)
    g.translate(...position)
    append(name, g, chrome)
  }
  if (part === 'cabrio') {
    emblem('Nabla bonnet grille badge', 0.115, Math.PI, [0, 0.592, 2.145])
    emblem('Nabla boot badge', 0.09, 0, [0, 0.907, -2.155])
    // Thin interior seals only: the open convertible cabin and body contour remain untouched.
    // Narrow spine at the axles, full-width panels only outside the tire sweep.
    // A full-width rectangle here cuts through the inner sidewalls and steered front tires.
    const panels = [
      ['A3 closed underfloor', 0.92, 3.94, 0],
      ['A3 cabin floor seal', 1.48, 1.68, 0],
      ['A3 front floor seal', 1.0, 0.22, 1.88],
      ['A3 rear floor seal', 1.0, 0.22, -1.88],
    ]
    for (const [name, width, length, z] of panels) {
      const floor = new BoxGeometry(width, 0.018, length)
      floor.translate(0, 0.22, z)
      append(name, floor, liner)
    }
    // Keep the liners inboard of the entire tire, not centred on the visible wheel.
    for (const x of [-0.4, 0.4])
      for (const z of [-1.292, 1.292]) {
        const g = new CylinderGeometry(0.4, 0.4, 0.16, 24, 1, false, 0, Math.PI)
        g.rotateZ(Math.PI / 2)
        g.translate(x, 0.315, z)
        append(`A3 wheel arch inner ${x} ${z}`, g, liner)
      }
    // An opaque shaped back bowl behind each clear lens prevents seeing through the car.
    for (const mi of [10, 11]) {
      const node = j.nodes.find((n) => n.mesh === mi)
      const lens = j.meshes[mi].primitives.find((p) => j.materials[p.material].name === 'FocoClear')
      const g = new BufferGeometry()
      g.setAttribute(
        'position',
        new Float32BufferAttribute(read(lens.attributes.POSITION).flat(), 3),
      )
      g.setAttribute('normal', new Float32BufferAttribute(read(lens.attributes.NORMAL).flat(), 3))
      g.setIndex(read(lens.indices).flat())
      g.applyMatrix4(
        new Matrix4().compose(
          new Vector3(...node.translation),
          new Quaternion(...node.rotation),
          new Vector3(1, 1, 1),
        ),
      )
      g.translate(0, 0, -0.075)
      append(`A3 opaque headlamp backing ${mi}`, g, liner)
    }
    const housing = j.materials.find((m) => m.name === 'Llanta 5')
    delete housing.alphaMode
    delete housing.pbrMetallicRoughness.baseColorTexture
    housing.pbrMetallicRoughness.baseColorFactor = [0.018, 0.022, 0.028, 1]
    housing.pbrMetallicRoughness.roughnessFactor = 0.55
    housing.pbrMetallicRoughness.metallicFactor = 0
  } else emblem('Nabla steering centre', 0.065, -Math.PI / 2, [0.129, 0.0064, 0])
  j.asset.generator =
    'Nabla prepare-a3.mjs; protected body and optical surfaces; simplified small details'
  writeGlb(new URL(`../assets/studio/cars/a3/a3.${part}.glb`, import.meta.url), j, read, bin)
  console.log(part, { before, after, removed })
}
