export function groundGlb(empty = false) {
  const positions = new Float32Array([
    -600, 0, -600, -600, 0, 600, 600, 0, 600, -600, 0, -600, 600, 0, 600, 600, 0, -600,
  ])
  const normals = new Float32Array(Array.from({ length: 18 }, (_, i) => (i % 3 === 1 ? 1 : 0)))
  const binary = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(normals.buffer)])
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: empty ? [] : [0] }],
      nodes: [{ mesh: 0, extras: { category: 'Terrain' } }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 } }] }],
      buffers: [{ byteLength: binary.length }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 72 },
        { buffer: 0, byteOffset: 72, byteLength: 72 },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 6,
          type: 'VEC3',
          min: [-600, 0, -600],
          max: [600, 0, 600],
        },
        { bufferView: 1, componentType: 5126, count: 6, type: 'VEC3' },
      ],
    }),
  )
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20)
  json.copy(padded)
  const out = Buffer.alloc(28 + padded.length + binary.length)
  out.writeUInt32LE(0x46546c67, 0)
  out.writeUInt32LE(2, 4)
  out.writeUInt32LE(out.length, 8)
  out.writeUInt32LE(padded.length, 12)
  out.writeUInt32LE(0x4e4f534a, 16)
  padded.copy(out, 20)
  out.writeUInt32LE(binary.length, 20 + padded.length)
  out.writeUInt32LE(0x004e4942, 24 + padded.length)
  binary.copy(out, 28 + padded.length)
  return out
}
