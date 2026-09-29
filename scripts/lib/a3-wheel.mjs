/** Photo-inspired ten-spoke wheel. Metres, axle X, outside face +X. */
import { LatheGeometry, Vector2, Shape, ExtrudeGeometry, CylinderGeometry } from 'three'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'
import { writeGlb } from './glb.mjs'

export function writeA3Wheel(destination, badge) {
  const batches = [[], [], [], []]
  const lathe = (profile, segments = 64) =>
    new LatheGeometry(
      profile.map(([x, r]) => new Vector2(r, x)),
      segments,
    ).rotateZ(-Math.PI / 2)
  const cylinder = (r, depth, x, segments = 32) =>
    new CylinderGeometry(r, r, depth, segments).rotateZ(-Math.PI / 2).translate(x, 0, 0)
  // Rounded sidewalls and two shallow circumferential grooves, without modelled tread blocks.
  batches[1].push(
    lathe([
      [-0.114, 0.246],
      [-0.122, 0.27],
      [-0.116, 0.298],
      [-0.098, 0.311],
      [-0.078, 0.315],
      [-0.044, 0.315],
      [-0.041, 0.312],
      [-0.038, 0.315],
      [0.034, 0.315],
      [0.037, 0.312],
      [0.04, 0.315],
      [0.074, 0.315],
      [0.099, 0.309],
      [0.115, 0.295],
      [0.118, 0.268],
      [0.11, 0.246],
      [-0.114, 0.246],
    ]),
  )
  batches[0].push(
    lathe([
      [-0.112, 0.238],
      [-0.112, 0.25],
      [0.105, 0.25],
      [0.118, 0.245],
      [0.118, 0.233],
      [0.107, 0.23],
      [0.099, 0.238],
      [-0.112, 0.238],
    ]),
  )
  batches[2].push(
    lathe([
      [-0.105, 0.236],
      [0.093, 0.236],
      [0.093, 0.229],
      [-0.105, 0.229],
      [-0.105, 0.236],
    ]),
  )
  const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)]
  function prism(points, x, depth, bevel = 0.0015) {
    const shape = new Shape()
    points.forEach(([u, v], i) => (i ? shape.lineTo(u, v) : shape.moveTo(u, v)))
    shape.closePath()
    return new ExtrudeGeometry(shape, {
      depth,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelThickness: bevel,
      bevelSize: bevel,
      curveSegments: 1,
    })
      .rotateY(Math.PI / 2)
      .translate(x, 0, 0)
  }
  // Each V pair meets close to a lug and fans out into broad polished shoulders.
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 + Math.PI / 2
    for (const sign of [-1, 1]) {
      const inner = a + sign * 0.11,
        outer = a + sign * 0.36
      batches[0].push(
        prism(
          [
            polar(0.063, inner - 0.08),
            polar(0.238, outer - 0.105),
            polar(0.244, outer + 0.105),
            polar(0.063, inner + 0.08),
          ],
          0.091,
          0.018,
        ),
      )
    }
  }
  const hub = Array.from({ length: 10 }, (_, i) =>
    polar(i % 2 ? 0.064 : 0.095, (i * Math.PI) / 5 + Math.PI / 2),
  )
  batches[0].push(prism(hub, 0.086, 0.019))
  batches[2].push(cylinder(0.03, 0.007, 0.111))
  // Lug wells sit on the hub points; bright recessed bolts break up the black recess.
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 + Math.PI / 2
    const y = 0.077 * Math.sin(a),
      z = -0.077 * Math.cos(a)
    batches[2].push(cylinder(0.011, 0.002, 0.109, 16).translate(0, y, z))
    batches[0].push(cylinder(0.006, 0.002, 0.1105, 6).translate(0, y, z))
  }
  batches[3].push(cylinder(0.193, 0.012, 0.048, 48))
  const emblem = badge.clone()
  emblem.scale(0.033 / 0.13318918645, 0.033 / 0.13318918645, 0.033 / 0.13318918645)
  emblem.rotateY(-Math.PI / 2).translate(0.117, 0, 0)
  batches[0].push(emblem)
  const materials = [
    {
      name: 'Nabla polished chrome',
      pbrMetallicRoughness: {
        baseColorFactor: [0.86, 0.89, 0.93, 1],
        metallicFactor: 1,
        roughnessFactor: 0.18,
      },
    },
    {
      name: 'Nabla lightweight tyre',
      pbrMetallicRoughness: {
        baseColorFactor: [0.022, 0.025, 0.029, 1],
        metallicFactor: 0,
        roughnessFactor: 0.88,
      },
    },
    {
      name: 'Nabla wheel recesses',
      pbrMetallicRoughness: {
        baseColorFactor: [0.027, 0.033, 0.041, 1],
        metallicFactor: 0.45,
        roughnessFactor: 0.32,
      },
    },
    {
      name: 'Nabla brake disc',
      pbrMetallicRoughness: {
        baseColorFactor: [0.18, 0.19, 0.21, 1],
        metallicFactor: 0.7,
        roughnessFactor: 0.65,
      },
    },
  ]
  const j = {
    asset: { version: '2.0', generator: 'Nabla photo-inspired ten-spoke wheel' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Nabla ten spoke wheel', mesh: 0 }],
    meshes: [{ primitives: [] }],
    materials,
    accessors: [],
  }
  const values = []
  const add = (data, type) => {
    values.push(data)
    j.accessors.push({ type })
    return values.length - 1
  }
  let triangles = 0
  for (const [material, geometries] of batches.entries()) {
    const clean = geometries.map((g) => {
      const n = g.index ? g.toNonIndexed() : g.clone()
      for (const name of Object.keys(n.attributes))
        if (!['position', 'normal'].includes(name)) n.deleteAttribute(name)
      return n
    })
    const unindexed = mergeGeometries(clean)
    const merged = mergeVertices(unindexed)
    unindexed.dispose()
    const attributes = {}
    for (const [name, key] of [
      ['position', 'POSITION'],
      ['normal', 'NORMAL'],
    ]) {
      const attr = merged.getAttribute(name)
      attributes[key] = add(
        Array.from({ length: attr.count }, (_, i) => [attr.getX(i), attr.getY(i), attr.getZ(i)]),
        'VEC3',
      )
    }
    j.meshes[0].primitives.push({
      attributes,
      indices: add(
        Array.from(merged.index.array, (i) => [i]),
        'SCALAR',
      ),
      material,
    })
    triangles += merged.index.count / 3
    for (const g of [...geometries, ...clean, merged]) g.dispose()
  }
  writeGlb(destination, j, (i) => values[i], Buffer.alloc(0))
  return { triangles, draws: 4 }
}
