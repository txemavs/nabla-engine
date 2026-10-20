import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

// Headless SwiftShader WebGL screenshots of the bullet effects with a fixed clock and seeded
// Math.random, plus their draw calls and JS cost. Run on this branch and on the commit before it
// (same spec copied over) with NABLA_SHOTS_DIR / NABLA_SHOTS_LABEL to compare.
const scenes = ['metal-hit', 'concrete-hit', 'ground-hit', 'tracer-burst', 'muzzle-flash']

for (const scene of scenes) {
  test(`bullet effects render: ${scene}`, async ({ page }) => {
    await page.route('**/realistic-sparks-test', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0"></body>',
      }),
    )
    await page.goto('/realistic-sparks-test')
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 2000))
    })
    const hasFlash = existsSync(`${process.cwd()}/src/render/entity/muzzle-flash.ts`)
    const result = await page.evaluate(
      async ({ root, scene, hasFlash }) => {
        const T = await import(`/@fs/${root}/node_modules/three/build/three.module.js`)
        const { ShotSparks } = await import(`/@fs/${root}/src/render/entity/shot-sparks.ts`)
        const { ShotTracers } = await import(`/@fs/${root}/src/render/entity/shot-tracers.ts`)
        const { ImpactMarks } = await import(`/@fs/${root}/src/render/entity/impact-marks.ts`)
        const flashModule = hasFlash
          ? await import(`/@fs/${root}/src/render/entity/muzzle-flash.ts`)
          : null
        const W = 480,
          H = 320
        const canvas = document.createElement('canvas')
        document.body.append(canvas)
        const renderer = new T.WebGLRenderer({
          canvas,
          antialias: false,
          logarithmicDepthBuffer: true,
          preserveDrawingBuffer: true,
        })
        renderer.setPixelRatio(1)
        renderer.setSize(W, H, false)
        const gl = renderer.getContext()
        let s = 1234
        Math.random = () => {
          s = (s + 0x6d2b79f5) | 0
          let t = Math.imul(s ^ (s >>> 15), 1 | s)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
        const world = new T.Scene()
        world.background = new T.Color('#1d2630')
        const space = new T.Group()
        world.add(space)
        const ground = new T.Mesh(
          new T.PlaneGeometry(40, 40).rotateX(-Math.PI / 2),
          new T.MeshBasicMaterial({ color: '#3a3c3e' }),
        )
        const wall = new T.Mesh(
          new T.PlaneGeometry(6, 3),
          new T.MeshBasicMaterial({ color: scene === 'metal-hit' ? '#5d6670' : '#8a857c' }),
        )
        wall.position.set(0, 1.5, -1)
        space.add(ground, wall)
        const camera = new T.PerspectiveCamera(50, W / H, 0.01, 200)
        const sparks = new ShotSparks()
        const tracers = new ShotTracers()
        const marks = new ImpactMarks()
        const effects = new T.Group()
        effects.add(sparks.root, tracers.root)
        space.add(effects)
        let shoot = (_now: number) => undefined as void
        let shotTimes = [1000]
        let at = 1000 + 45
        if (scene === 'metal-hit' || scene === 'concrete-hit' || scene === 'ground-hit') {
          const groundHit = scene === 'ground-hit'
          const point: [number, number, number] = groundHit ? [0, 0, 0] : [0, 1.0, -0.997]
          const normal: [number, number, number] = groundHit ? [0, 1, 0] : [0, 0, 1]
          const surface = scene.split('-')[0]
          camera.position.set(0.9, groundHit ? 0.7 : 1.25, groundHit ? 1.3 : 0.6)
          camera.lookAt(point[0], point[1] + 0.1, point[2])
          shoot = (now) => {
            sparks.add(point, now, normal, { surface })
            marks.addWorld(space, point, normal)
          }
          shotTimes = [1000, 1003]
          at = 1060
        } else if (scene === 'tracer-burst') {
          camera.position.set(2.2, 1.6, 1.5)
          camera.lookAt(0, 1.2, -4)
          shotTimes = [1000, 1012, 1024, 1036, 1048]
          let i = 0
          shoot = (now) => {
            const k = i++
            tracers.add([0.1 * k, 1.3, 0.5], [0.4 - 0.15 * k, 1.0 + 0.05 * k, -12], now)
          }
          at = 1060
        } else {
          camera.position.set(0.09, 0.03, 0.06)
          camera.lookAt(0, 0, -0.03)
          const geometry = flashModule
            ? flashModule.muzzleFlashGeometry()
            : new T.ConeGeometry(0.012, 0.03, 6)
          const flash = new T.Mesh(
            geometry,
            new T.MeshBasicMaterial({
              color: '#ffd9a0',
              transparent: true,
              opacity: 0.55,
              blending: T.AdditiveBlending,
              depthWrite: false,
            }),
          )
          flash.rotation.x = -Math.PI / 2
          flash.position.set(0, 0, -0.015)
          effects.add(flash)
          shoot = () => {
            if (flashModule) flashModule.shapeMuzzleFlash(flash, 1000, 12, 0.55)
          }
          at = 1012
        }
        // JS cost of spawning and updating, repeated without rendering.
        for (const t of shotTimes) shoot(t)
        sparks.update(at)
        tracers.update(at)
        renderer.render(world, camera)
        const pixels = new Uint8Array(W * H * 4)
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
        // Draw calls of the effects alone (background and scenery hidden).
        world.background = null
        ground.visible = wall.visible = false
        renderer.info.reset()
        renderer.render(world, camera)
        const calls = renderer.info.render.calls
        const t0 = performance.now()
        let now = 5000
        for (let f = 0; f < 2000; f++) {
          now += 16.6
          if (f % 6 === 0) for (const t of shotTimes) shoot(now + t - 1000)
          sparks.update(now)
          tracers.update(now)
        }
        const jsMs = (performance.now() - t0) / 2000
        const c = document.createElement('canvas')
        c.width = W
        c.height = H
        const x = c.getContext('2d')!
        const img = x.createImageData(W, H)
        for (let y = 0; y < H; y++)
          img.data.set(pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4)
        x.putImageData(img, 0, 0)
        let lit = 0
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] > 200) lit++
        sparks.dispose()
        tracers.dispose()
        marks.dispose()
        return { png: c.toDataURL(), calls, jsMs, lit }
      },
      { root: process.cwd(), scene, hasFlash },
    )
    const dir = process.env.NABLA_SHOTS_DIR
    const label = process.env.NABLA_SHOTS_LABEL ?? 'after'
    if (dir) {
      mkdirSync(dir, { recursive: true })
      writeFileSync(`${dir}/${scene}-${label}.png`, Buffer.from(result.png.split(',')[1], 'base64'))
    }
    const { png: _png, ...summary } = result
    console.log(`[bullet-effects] ${label} ${scene} ${JSON.stringify(summary)}`)
    expect(errors).toEqual([])
    expect(result.lit).toBeGreaterThan(0)
  })
}
