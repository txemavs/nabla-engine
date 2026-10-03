import assert from 'node:assert/strict'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('white-truck-studio.json', root)))
const reports = []
for (const filename of await readdir(new URL('assets/', root))) {
  if (!filename.endsWith('.glb')) continue
  const bytes = await readFile(new URL('assets/' + filename, root))
  assert.equal(bytes.readUInt32LE(0), 0x46546c67)
  assert.equal(bytes.readUInt32LE(4), 2)
  assert.equal(bytes.readUInt32LE(8), bytes.length)
  const length = bytes.readUInt32LE(12)
  const doc = JSON.parse(bytes.subarray(20, 20 + length))
  const binary = bytes.subarray(28 + length)
  assert(!doc.images && !doc.textures)
  assert(doc.asset.extras.license.startsWith('CC-BY-4.0'))
  assert.equal(doc.extras.drivable, false)
  let triangles = 0
  for (const mesh of doc.meshes) {
    for (const primitive of mesh.primitives) {
      assert.deepEqual(Object.keys(primitive.attributes).sort(), ['NORMAL', 'POSITION'])
      const position = doc.accessors[primitive.attributes.POSITION]
      for (const index of Object.values(primitive.attributes)) {
        const a = doc.accessors[index]
        const view = doc.bufferViews[a.bufferView]
        const offset = (view.byteOffset ?? 0) + (a.byteOffset ?? 0)
        for (let i = 0; i < a.count * 3; i++)
          assert(Number.isFinite(binary.readFloatLE(offset + i * 4)))
      }
      const a = doc.accessors[primitive.indices]
      const offset = doc.bufferViews[a.bufferView].byteOffset ?? 0
      assert.equal(a.count % 3, 0)
      for (let i = 0; i < a.count; i++) assert(binary.readUInt32LE(offset + i * 4) < position.count)
      triangles += a.count / 3
    }
  }
  if (filename.endsWith('.body.glb')) {
    assert(!doc.meshes.some((mesh) => /^wheel_|original_rim|original_spokes/.test(mesh.name)))
    const key = filename.startsWith('tractor') ? 'tractor' : 'trailer'
    const anchorName = key === 'tractor' ? 'fifth_wheel' : 'kingpin'
    const anchor = doc.nodes.find((node) => node.name === anchorName)
    assert.deepEqual(anchor.translation, manifest[key].anchor)
    for (const wheel of manifest[key].wheels)
      assert(doc.nodes.some((node) => node.name === 'hub_' + wheel.id))
  }
  if (filename === 'tractor.body.glb') {
    assert(
      doc.materials.some(
        (material) =>
          material.name === 'Dark glass' &&
          material.alphaMode === 'BLEND' &&
          material.pbrMetallicRoughness.baseColorFactor[3] < 1,
      ),
    )
    const used = new Set(doc.meshes.flatMap((mesh) => mesh.primitives.map((p) => p.material)))
    assert(used.has(5) && used.has(6) && used.has(7))
  }
  reports.push({
    filename,
    bytes: bytes.length,
    triangles,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  })
}
assert.equal(reports.length, 5)
await writeFile(
  new URL('asset-results.json', root),
  JSON.stringify({ status: 'passed', reports }, null, 2),
)
console.log('Five GLBs: binary geometry, materials, independent parts and anchors passed')
