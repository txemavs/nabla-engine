import { PerspectiveCamera, WebGLRenderer, Vector2, Vector4 } from 'three'

const table = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})
function chunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(data.length + 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, data.length)
  bytes.set(new TextEncoder().encode(type), 4)
  bytes.set(data, 8)
  let crc = 0xffffffff
  for (let i = 4; i < bytes.length - 4; i++) crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8)
  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0)
  return bytes
}

/** Tiled PNG export using the renderer’s normal canvas antialiasing and tone mapping. Does not allocate a full-size GPU target or canvas.
 * The host freezes animation/scene edits and supplies its normal sky/scene pass.
 */
export async function capturePng(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  render: (tile: PerspectiveCamera) => void,
  options: {
    width: number
    height: number
    signal?: AbortSignal
    progress?: (fraction: number) => void
  },
): Promise<Blob> {
  const { width, height, signal } = options
  if (![width, height].every((n) => Number.isInteger(n) && n > 0 && n <= 16384))
    throw Error('Dimensiones de foto no válidas')
  const size = Math.min(1024, renderer.capabilities.maxTextureSize)
  const oldSize = renderer.getSize(new Vector2()),
    oldRatio = renderer.getPixelRatio()
  const tile = camera.clone()
  const oldTarget = renderer.getRenderTarget(),
    oldViewport = renderer.getViewport(new Vector4()),
    oldScissor = renderer.getScissor(new Vector4()),
    oldScissorTest = renderer.getScissorTest(),
    oldClear = renderer.autoClear
  const stream = new CompressionStream('deflate')
  const writer = stream.writable.getWriter()
  const reader = stream.readable.getReader()
  const header = new Uint8Array(13),
    headerView = new DataView(header.buffer)
  headerView.setUint32(0, width)
  headerView.setUint32(4, height)
  header[8] = 8
  header[9] = 6 // Eight-bit RGBA, standard PNG compression/filtering.
  const parts: BlobPart[] = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
  ]
  const drain = (async () => {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return
      parts.push(chunk('IDAT', value))
    }
  })()
  // Observe errors immediately, including cancellation before compression finishes.
  void drain.catch(() => {})
  try {
    renderer.setPixelRatio(1)
    renderer.setScissorTest(false)
    for (let y = 0; y < height; y += size) {
      const h = Math.min(size, height - y),
        stride = width * 4 + 1
      const band = new Uint8Array(stride * h) // PNG filter 0 precedes each scanline.
      for (let x = 0; x < width; x += size) {
        signal?.throwIfAborted()
        if (renderer.getContext().isContextLost()) throw Error('Se ha perdido el contexto gráfico')
        const w = Math.min(size, width - x)
        renderer.setSize(w, h, false)
        renderer.setRenderTarget(null)
        tile.setViewOffset(width, height, x, y, w, h)
        tile.updateMatrixWorld(true)
        render(tile)
        const pixels = new Uint8Array(w * h * 4)
        const gl = renderer.getContext()
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        for (let row = 0; row < h; row++)
          band.set(
            pixels.subarray((h - row - 1) * w * 4, (h - row) * w * 4),
            row * stride + 1 + x * 4,
          )
        options.progress?.((y * width + h * (x + w)) / (width * height))
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      signal?.throwIfAborted()
      await writer.write(band)
    }
    await writer.close()
    await drain
    signal?.throwIfAborted()
    parts.push(chunk('IEND', new Uint8Array()))
    return new Blob(parts, { type: 'image/png' })
  } catch (error) {
    await Promise.allSettled([writer.abort(error), reader.cancel(error)])
    throw error
  } finally {
    renderer.setPixelRatio(oldRatio)
    renderer.setSize(oldSize.x, oldSize.y, false)
    renderer.setRenderTarget(oldTarget)
    renderer.setViewport(oldViewport)
    renderer.setScissor(oldScissor)
    renderer.setScissorTest(oldScissorTest)
    renderer.autoClear = oldClear
  }
}
