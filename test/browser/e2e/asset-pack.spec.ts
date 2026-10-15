import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const bytesPerSecond = 1_000_000
const latencyMs = 30

test.beforeAll(() => execFileSync(process.execPath, ['scripts/pack-assets.mjs']))

test('packed GLBs preserve scenes and avoid range downloads on a warm visit', async ({ page }) => {
  // Raw and cold passes intentionally transfer the entire growing catalog at 1 MB/s.
  // Keep content/cache assertions unchanged; allow transfer, decoding and runner overhead.
  const manifest = JSON.parse(readFileSync('assets/packs/index.json', 'utf8')) as {
    size: number
    entries: Record<string, { decodedLength: number }>
  }
  const entries = Object.values(manifest.entries)
  const transferBytes = manifest.size + entries.reduce((sum, entry) => sum + entry.decodedLength, 0)
  test.setTimeout(
    60_000 + (2_000 * transferBytes) / bytesPerSecond + 2 * entries.length * latencyMs,
  )
  await page.route('**/pack-check', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body>Asset pack benchmark</body>',
    }),
  )
  await page.goto('/pack-check')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: latencyMs,
    downloadThroughput: bytesPerSecond,
    uploadThroughput: bytesPerSecond,
  })
  const result = await page.evaluate(
    async (root) => {
      const { AssetPack } = await import(`/@fs/${root}/src/render/entity/asset-pack.ts`)
      const { GLTFLoader } = await import(
        `/@fs/${root}/node_modules/three/examples/jsm/loaders/GLTFLoader.js`
      )
      await caches.delete('nabla-assets-v1')
      const manifest = await (await fetch('/packs/index.json')).json()
      const urls = Object.keys(manifest.entries)
      const loader = new GLTFLoader()
      const signature = (scene: any) => {
        const nodes: unknown[] = []
        scene.traverse((node: any) =>
          nodes.push([
            node.name,
            node.type,
            node.children.length,
            node.geometry?.attributes.position?.count,
            node.userData,
          ]),
        )
        return JSON.stringify(nodes)
      }
      const run = async (packed: boolean) => {
        const pack = new AssetPack()
        const signatures = []
        const start = performance.now()
        for (const url of urls) {
          const bytes = packed
            ? await pack.read(url)
            : await (await fetch(url, { cache: 'no-store' })).arrayBuffer()
          if (!bytes) throw new Error(`No packed bytes for ${url}`)
          const gltf = await loader.parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1))
          signatures.push(signature(gltf.scene))
        }
        return { milliseconds: performance.now() - start, signatures }
      }
      const raw = await run(false)
      const cold = await run(true)
      const warm = await run(true)
      return {
        count: urls.length,
        equal:
          JSON.stringify(raw.signatures) === JSON.stringify(cold.signatures) &&
          JSON.stringify(cold.signatures) === JSON.stringify(warm.signatures),
        rawMs: raw.milliseconds,
        coldMs: cold.milliseconds,
        warmMs: warm.milliseconds,
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  console.log('Asset pack benchmark (1 MB/s, 30 ms latency):', result)
  expect(result.count).toBeGreaterThan(0)
  expect(result.equal).toBe(true)
  expect(result.warmMs).toBeLessThan(result.rawMs)
})
