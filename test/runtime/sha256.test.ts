import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { sha256, sha256Portable } from '../../src/util/sha256.js'
it('matches SHA-256 at padding/block boundaries and for binary asset buffers', async () => {
  for (const size of [0, 1, 55, 56, 63, 64, 65, 127, 128, 1000000]) {
    const bytes = Uint8Array.from({ length: size }, (_, i) => (i * 137 + 93) & 255)
    const expected = createHash('sha256').update(bytes).digest('hex')
    expect(sha256Portable(bytes)).toBe(expected)
    expect(await sha256(bytes.buffer)).toBe(expected)
  }
})
