import { readFile } from 'node:fs/promises'
import { createInflate } from 'node:zlib'
import { test, expect } from './studio-test.js'

test('camera beside Play downloads a complete 16K PNG and resumes the viewport', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'nabla.performance.v1',
      JSON.stringify({ resolution: 0.35, shadows: 0, mirrors: 0 }),
    )
    localStorage.setItem(
      'nabla.scene.v1',
      JSON.stringify({
        version: 1,
        name: 'Photo test',
        entities: [
          {
            id: 'spawn',
            name: 'Spawn',
            kind: 'spawn',
            parentId: null,
            transform: { position: [0, 2, 0], rotation: [0, 0, 0, 1] },
            size: [1, 1, 1],
            motion: 'none',
            mass: 1,
            color: '#ffffff',
          },
        ],
      }),
    )
  })
  await page.goto('/?scene=circuit')
  expect(await page.locator('#photo').evaluate((e) => e.nextElementSibling?.id)).toBe('play')
  const download = page.waitForEvent('download', { timeout: 90000 })
  await page.locator('#photo').click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/nabla-.*15360.*\.png$/)
  const bytes = await readFile((await file.path())!)
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const width = bytes.readUInt32BE(16),
    height = bytes.readUInt32BE(20)
  expect(Math.max(width, height)).toBe(15360)
  const compressed: Buffer[] = []
  for (let i = 8; i < bytes.length;) {
    const n = bytes.readUInt32BE(i)
    if (bytes.toString('ascii', i + 4, i + 8) === 'IDAT')
      compressed.push(bytes.subarray(i + 8, i + 8 + n))
    i += n + 12
  }
  // Validate the complete compressed image without allocating a full 16K bitmap.
  let count = 0
  const inflater = createInflate()
  const done = new Promise<void>((resolve, reject) => {
    inflater.on('data', (b) => (count += b.length))
    inflater.on('end', resolve)
    inflater.on('error', reject)
  })
  inflater.end(Buffer.concat(compressed))
  await done
  expect(count).toBe((width * 4 + 1) * height)
  await expect(page.locator('#photo-progress')).not.toBeVisible()
  await expect(page.locator('#play')).toBeEnabled()
  await page.locator('#photo').click()
  await page.locator('#photo-cancel').click()
  await expect(page.locator('#photo-progress')).not.toBeVisible()
  await expect(page.locator('#toast')).toHaveText('Foto cancelada')
})

test('tiled PNG matches a single render across tile boundaries and restores renderer state', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { capturePng } = await import(`/@fs${root}/src/render/capture.ts`)
    const renderer = new T.WebGLRenderer({ antialias: true })
    const w = 2053,
      h = 1031
    renderer.setSize(w, h)
    const scene = new T.Scene()
    const geometry = new T.PlaneGeometry(6, 3)
    const material = new T.ShaderMaterial({
      vertexShader:
        'varying vec2 coord; void main(){coord=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 coord; void main(){gl_FragColor=vec4(coord,0.2,1.0);}',
    })
    scene.add(new T.Mesh(geometry, material))
    const camera = new T.PerspectiveCamera(60, w / h, 0.1, 100)
    camera.position.z = 3
    renderer.render(scene, camera)
    const gl = renderer.getContext(),
      reference = new Uint8Array(w * h * 4)
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, reference)
    const blob = await capturePng(renderer, camera, (tile: any) => renderer.render(scene, tile), {
      width: w,
      height: h,
    })
    const bitmap = await createImageBitmap(blob)
    const canvas = new OffscreenCanvas(w, h),
      ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const pixels = ctx.getImageData(0, 0, w, h).data
    let error = 0
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let c = 0; c < 3; c++)
          error += Math.abs(pixels[(y * w + x) * 4 + c] - reference[((h - y - 1) * w + x) * 4 + c])
    const restored = renderer.getSize(new T.Vector2()).toArray()
    bitmap.close()
    renderer.dispose()
    geometry.dispose()
    material.dispose()
    return { error: error / (w * h * 3), restored, view: camera.view }
  }, process.cwd())
  expect(result.error).toBeLessThan(0.2)
  expect(result.restored).toEqual([2053, 1031])
  expect(result.view).toBeNull()
})
