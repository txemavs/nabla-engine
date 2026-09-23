export function triangleGlb() {
  const binary = Buffer.from(new Float32Array([-50, 0, -50, 50, 0, -50, 0, 0, 50]).buffer)
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: '2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [{ byteLength: binary.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: 'VEC3',
          min: [-50, 0, -50],
          max: [50, 0, 50],
        },
      ],
    }),
  )
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20)
  json.copy(padded)
  const result = Buffer.alloc(12 + 8 + padded.length + 8 + binary.length)
  result.writeUInt32LE(0x46546c67, 0)
  result.writeUInt32LE(2, 4)
  result.writeUInt32LE(result.length, 8)
  result.writeUInt32LE(padded.length, 12)
  result.writeUInt32LE(0x4e4f534a, 16)
  padded.copy(result, 20)
  const offset = 20 + padded.length
  result.writeUInt32LE(binary.length, offset)
  result.writeUInt32LE(0x004e4942, offset + 4)
  binary.copy(result, offset + 8)
  return result
}
