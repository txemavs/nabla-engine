import type { PlanetPhoto } from '../../planet/contract.js'
import { sha256 } from '../../util/sha256.js'

/** Phase timer: name and milliseconds since the previous phase. */
export type PhotoMark = (name: string, ms: number) => void

/**
 * Download, verify and decode a package orthophoto, flipped so the texture needs no `flipY`
 * (north-up, v up). Runs on the main thread or in a loading worker (see `loading-workers.ts`).
 */
export async function decodePackagePhoto(
  url: string,
  photo: Pick<PlanetPhoto, 'bytes' | 'sha256'>,
  mark?: PhotoMark,
): Promise<ImageBitmap> {
  let started = performance.now()
  const lap = (name: string) => {
    const now = performance.now()
    mark?.(name, now - started)
    started = now
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
  if (!response.ok) throw new Error(`Photo ${url}: HTTP ${response.status}`)
  const bytes = await response.arrayBuffer()
  lap('photoFetch')
  if (bytes.byteLength !== photo.bytes) throw new Error(`Photo ${url}: size mismatch`)
  if ((await sha256(bytes)) !== photo.sha256) throw new Error(`Photo ${url}: checksum mismatch`)
  lap('photoVerify')
  const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: 'flipY' })
  lap('photoDecode')
  return bitmap
}
