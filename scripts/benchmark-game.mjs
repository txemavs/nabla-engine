/** Compare warm, stationary chase-camera profiles at a fixed viewport. Never equate CPU timing with GPU timing. */
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
const results = []
try {
  for (const quality of ['custom', 'mobile', 'minimal']) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
    })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(
      `${process.env.NABLA_BENCH_URL ?? 'http://127.0.0.1:5192/'}?example=flat&diagnostics=1&quality=${quality}`,
    )
    await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 45000 })
    await page.locator('#game-canvas').click()
    await page.keyboard.press('KeyC')
    await page.keyboard.press('KeyC')
    const data = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const canvas = document.getElementById('game-canvas')
          const timeout = setTimeout(() => {
            canvas.removeEventListener('nabla:frame', listener)
            reject(new Error('Timed out collecting runtime diagnostics'))
          }, 60000)
          const gl = canvas.getContext('webgl2')
          const extension = gl.getExtension('WEBGL_debug_renderer_info')
          const renderer = extension
            ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER)
          let warmup = 90
          const samples = []
          const listener = (event) => {
            if (warmup-- > 0) return
            samples.push(event.detail)
            if (samples.length === 180) {
              clearTimeout(timeout)
              canvas.removeEventListener('nabla:frame', listener)
              resolve({ renderer, samples })
            }
          }
          canvas.addEventListener('nabla:frame', listener)
        }),
    )
    if (errors.length) throw new Error(errors.join('\n'))
    const mean = (key) => data.samples.reduce((sum, s) => sum + s[key], 0) / data.samples.length
    const percentile = (key, p) =>
      data.samples.map((s) => s[key]).sort((a, b) => a - b)[
        Math.floor((data.samples.length - 1) * p)
      ]
    const result = {
      quality,
      renderer: data.renderer,
      samples: data.samples.length,
      fps: 1000 / mean('frameMs'),
      frameP95Ms: percentile('frameMs', 0.95),
      frameP99Ms: percentile('frameMs', 0.99),
      cpuMeanMs: mean('cpuMs'),
      physicsMeanMs: mean('physicsMs'),
      installMeanMs: mean('installMs'),
      calls: mean('calls'),
      triangles: mean('triangles'),
      width: data.samples[0].width,
      height: data.samples[0].height,
      droppedSeconds: data.samples.at(-1).droppedSeconds - data.samples[0].droppedSeconds,
    }
    assert(result.calls > 0 && result.triangles > 0 && Number.isFinite(result.cpuMeanMs))
    assert.equal(result.width, { custom: 1280, mobile: 640, minimal: 448 }[quality])
    results.push(result)
    console.log(JSON.stringify(result))
    await page.close()
  }
} finally {
  await browser.close()
}
const report = {
  scenario:
    'Warm offline flat Z15, parked fleet, exterior chase, 1280x800 CSS, DPR 1, headless Chrome; no streaming arrivals',
  results,
}
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2) + '\n')
