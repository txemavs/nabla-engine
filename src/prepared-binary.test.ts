import { expect, it } from 'vitest'
import { decodePreparedBinary, encodePreparedBinary } from './prepared-binary.js'
it('round-trips geometry bytes and metadata without base64', () => {
  const position = new Float32Array([0, 1.5, -4]).buffer
  const normal = new Float32Array([0, 1, 0]).buffer
  const index = new Uint32Array([0]).buffer
  const binary = encodePreparedBinary(
    { version: 5, key: '-2_3', entities: [] },
    { mesh: { position, normal, index } },
  )
  const decoded = decodePreparedBinary(binary)
  expect(decoded.key).toBe('-2_3')
  expect(decoded.geometry.mesh.position).toEqual(position)
  expect(decoded.geometry.mesh.index).toEqual(index)
  expect(decoded.geometry.mesh.color).toBeUndefined()
})
it('rejects truncated, unaligned and unaccounted-for buffers', () => {
  const binary = encodePreparedBinary(
    { version: 5 },
    { mesh: { position: new Float32Array([1, 2, 3]).buffer } },
  )
  expect(() => decodePreparedBinary(binary.slice(0, -1))).toThrow()
  expect(() =>
    decodePreparedBinary(new Uint8Array([...new Uint8Array(binary), 0, 0, 0, 0]).buffer),
  ).toThrow()
  expect(() => encodePreparedBinary({}, { mesh: { position: new ArrayBuffer(3) } })).toThrow()
  new DataView(binary).setUint32(4, 0xffffffff, true)
  expect(() => decodePreparedBinary(binary)).toThrow()
})
it('rejects invalid magic and overlapping ranges', () => {
  const binary = encodePreparedBinary(
    {},
    { mesh: { position: new Float32Array([1]).buffer, normal: new Float32Array([1]).buffer } },
  )
  const bytes = new Uint8Array(binary)
  const text = new TextDecoder().decode(bytes.slice(8, 8 + new DataView(binary).getUint32(4, true)))
  const changed = text.replace('"normal":[4,4]', '"normal":[0,4]')
  bytes.set(new TextEncoder().encode(changed), 8)
  expect(() => decodePreparedBinary(binary)).toThrow()
  bytes[0] = 0
  expect(() => decodePreparedBinary(binary)).toThrow()
})
