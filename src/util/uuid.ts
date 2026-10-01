/**
 * UUID v4 that also works in insecure contexts (plain http on a LAN address),
 * where `crypto.randomUUID` is undefined.
 */
function formatV4(bytes: ArrayLike<number>): string {
  const b = Array.from(bytes, (v) => v & 0xff)
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const hex = b.map((v) => v.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Prefers crypto.randomUUID, then crypto.getRandomValues, then Math.random as a last resort. */
export function randomUUID(): string {
  const c = (globalThis as { crypto?: Partial<Crypto> }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  return formatV4(bytes)
}
