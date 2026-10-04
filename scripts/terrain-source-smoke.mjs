/** Verify missing-source diagnostics and offline planetary startup in the built demo. */
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: true,
  args: ['--enable-unsafe-swiftshader'],
})
try {
  const page = await browser.newPage()
  const requests = []
  const errors = []
  page.on('request', (request) => requests.push(request.url()))
  page.on('pageerror', (error) => errors.push(error.message))
  const url = new URL(process.env.NABLA_GAME_URL ?? 'http://127.0.0.1:5198/')
  url.search = ''
  await page.goto(url.href)
  await page.locator('#error-message.visible').waitFor()
  assert.match(await page.locator('#error-text').textContent(), /Terrain source missing/)
  assert.equal(requests.filter((request) => request.includes('/manifest.json')).length, 0)
  assert.equal(await page.locator('#game-hud:not(.hidden)').count(), 0)

  requests.length = 0
  url.search = '?example=flat'
  await page.goto(url.href)
  await page.locator('#game-hud:not(.hidden)').waitFor({ timeout: 45000 })
  const manifests = requests.filter((request) => request.includes('/manifest.json'))
  assert(manifests.length >= 4, 'Expected the four local Z15 manifests')
  assert(
    requests.every(
      (request) => !request.startsWith('http') || new URL(request).origin === url.origin,
    ),
  )
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({ missingSourceDiagnosed: true, localManifests: manifests.length, errors }),
  )
} finally {
  await browser.close()
}
