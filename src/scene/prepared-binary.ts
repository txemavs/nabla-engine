/** NBZ1: a bounded JSON manifest followed by aligned, little-endian geometry buffers. */
export const PREPARED_BINARY_LIMIT = 64 * 1024 * 1024
const magic = 0x315a424e
const fields = ['position', 'normal', 'index', 'color'] as const
type Buffers = Record<string, Partial<Record<(typeof fields)[number], ArrayBuffer>>>
export function encodePreparedBinary(
  metadata: Record<string, unknown>,
  geometry: Buffers,
): ArrayBuffer {
  let length = 0
  const ranges = Object.create(null) as Record<string, Record<string, number[]>>
  for (const [id, buffers] of Object.entries(geometry)) {
    ranges[id] = {}
    for (const field of fields) {
      const buffer = buffers[field]
      if (!buffer) continue
      if (buffer.byteLength % 4) throw Error('Unaligned prepared buffer')
      ranges[id][field] = [length, buffer.byteLength]
      length += buffer.byteLength
    }
  }
  const header = new TextEncoder().encode(JSON.stringify({ ...metadata, geometry: ranges }))
  const start = Math.ceil((8 + header.length) / 4) * 4
  if (start + length > PREPARED_BINARY_LIMIT) throw Error('Prepared binary exceeds size limit')
  const result = new ArrayBuffer(start + length),
    view = new DataView(result)
  view.setUint32(0, magic, true)
  view.setUint32(4, header.length, true)
  new Uint8Array(result, 8, header.length).set(header)
  for (const [id, buffers] of Object.entries(geometry))
    for (const field of fields) {
      const buffer = buffers[field]
      if (buffer)
        new Uint8Array(result, start + ranges[id][field][0], buffer.byteLength).set(
          new Uint8Array(buffer),
        )
    }
  return result
}
export function decodePreparedBinary(
  buffer: ArrayBuffer,
): Record<string, unknown> & { geometry: Buffers } {
  if (buffer.byteLength < 8 || buffer.byteLength > PREPARED_BINARY_LIMIT)
    throw Error('Invalid prepared binary size')
  const view = new DataView(buffer),
    length = view.getUint32(4, true)
  const start = Math.ceil((8 + length) / 4) * 4
  if (view.getUint32(0, true) !== magic || start > buffer.byteLength)
    throw Error('Invalid prepared binary header')
  const metadata = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(buffer, 8, length)),
  )
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    !metadata.geometry ||
    typeof metadata.geometry !== 'object'
  )
    throw Error('Invalid prepared manifest')
  const geometry: Buffers = Object.create(null)
  let expected = 0
  for (const [id, ranges] of Object.entries(metadata.geometry)) {
    if (!ranges || typeof ranges !== 'object') throw Error('Invalid prepared ranges')
    geometry[id] = {}
    for (const field of fields) {
      const range = (ranges as Record<string, unknown>)[field]
      if (range === undefined) continue
      if (!Array.isArray(range) || range.length !== 2 || !range.every(Number.isSafeInteger))
        throw Error('Invalid prepared range')
      const [offset, size] = range
      if (offset !== expected || size < 0 || size % 4 || start + offset + size > buffer.byteLength)
        throw Error('Invalid prepared buffer bounds')
      geometry[id][field] = buffer.slice(start + offset, start + offset + size)
      expected += size
    }
  }
  if (start + expected !== buffer.byteLength) throw Error('Unexpected prepared binary tail')
  return { ...metadata, geometry }
}
