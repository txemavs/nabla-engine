import { test, expect } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

// Headless SwiftShader WebGL: enough for pixels and JS timings, not for GPU timings.
// Each scene runs twice in the same page with a fixed clock and seeded Math.random: once with the
// former CPU particle simulations (legacy-particles.ts) and once with the analytic GPU pools
// (gpu-particles.ts). The frames must match.
const scenes = ['smoke', 'burning-car', 'explosion', 'sparks', 'tyre-smoke', 'muzzle-smoke']

for (const scene of scenes) {
  test(`analytic GPU particles match the CPU simulation: ${scene}`, async ({ page }) => {
    await page.route('**/gpu-particles-test', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0"></body>',
      }),
    )
    await page.goto('/gpu-particles-test')
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 2000))
    })
    const result = await page.evaluate(
      async ({ root, scene }) => {
        const T = await import(`/@fs/${root}/node_modules/three/build/three.module.js`)
        const legacy = await import(`/@fs/${root}/src/render/entity/legacy-particles.ts`)
        const { ExhaustSmoke } = await import(`/@fs/${root}/src/render/entity/exhaust-smoke.ts`)
        const { TireSmoke } = await import(`/@fs/${root}/src/render/entity/tire-smoke.ts`)
        const { MuzzleSmoke } = await import(`/@fs/${root}/src/render/entity/muzzle-smoke.ts`)
        const { ShotSparks } = await import(`/@fs/${root}/src/render/entity/shot-sparks.ts`)
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
        renderer.info.autoReset = false
        const gl = renderer.getContext()

        // Deterministic Math.random (mulberry32).
        const seed = (s: number) => () => {
          s |= 0
          s = (s + 0x6d2b79f5) | 0
          let t = Math.imul(s ^ (s >>> 15), 1 | s)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
        // Irregular frame steps, including clamped ones, to exercise frame-rate dependence.
        const steps = [1 / 60, 1 / 60, 1 / 30, 1 / 45, 0.07, 1 / 60, 1 / 120]

        const run = (analytic: boolean) => {
          // Before: the former CPU classes, kept verbatim. After: the default analytic pools.
          const Exhaust = analytic ? ExhaustSmoke : legacy.LegacyExhaustSmoke
          const Tire = analytic ? TireSmoke : legacy.LegacyTireSmoke
          const Muzzle = analytic ? MuzzleSmoke : legacy.LegacyMuzzleSmoke
          const Sparks = analytic ? ShotSparks : legacy.LegacyShotSparks
          const random = Math.random
          const world = new T.Scene()
          world.background = new T.Color('#93b7cd')
          const space = new T.Group()
          world.add(space)
          const ground = new T.Mesh(
            new T.PlaneGeometry(60, 60).rotateX(-Math.PI / 2),
            new T.MeshBasicMaterial({ color: '#4a4d50' }),
          )
          space.add(ground)
          const camera = new T.PerspectiveCamera(55, W / H, 0.05, 500)
          let update: (frame: number, dt: number, now: number) => void = () => undefined
          const disposers: (() => void)[] = []
          const anchor = (x: number, y: number, z: number) => {
            const a = new T.Group()
            a.position.set(x, y, z)
            space.add(a)
            return a
          }
          if (scene === 'smoke' || scene === 'burning-car' || scene === 'explosion') {
            const emitters: {
              smoke: InstanceType<typeof ExhaustSmoke>
              tick: (f: number, dt: number) => void
            }[] = []
            const add = (
              a: InstanceType<typeof T.Object3D>,
              options: object,
              tick: (smoke: InstanceType<typeof ExhaustSmoke>, f: number, dt: number) => void,
            ) => {
              const smoke = new Exhaust(a, space, options)
              space.add(smoke.root)
              emitters.push({ smoke, tick: (f, dt) => tick(smoke, f, dt) })
              disposers.push(() => smoke.dispose())
            }
            if (scene === 'smoke') {
              camera.position.set(2.5, 1.4, 3)
              camera.lookAt(0, 0.6, 0)
              // A moving car's twin exhausts (white) and a diesel that clears with speed.
              const car = anchor(0, 0.35, 0)
              const left = new T.Object3D()
              const right = new T.Object3D()
              left.position.set(-0.4, 0, -1)
              right.position.set(0.4, 0, -1)
              car.add(left, right)
              for (const [i, outlet] of [left, right].entries())
                add(outlet, { emissionPhase: i / 2 }, (s, f, dt) => {
                  s.setAmount(1 + 0.5 * Math.sin(f / 9))
                  s.update(dt, f < 150, 0.5 + 0.5 * Math.sin(f / 13), 30)
                })
              add(
                anchor(-1.5, 0.3, -0.5),
                { color: '#111111', clearColor: '#888888', clearAtKmh: 60, capacity: 96 },
                (s, f, dt) => s.update(dt, true, 1, (f * 2) % 80),
              )
              update = (f) => {
                car.position.z = Math.sin(f / 40) * 1.5
              }
            } else {
              camera.position.set(9, 5, 12)
              camera.lookAt(0, 3, 0)
              // Three burning wrecks and a damaged car, with destruction's options.
              for (const x of [-4, 0, 4])
                add(
                  anchor(x, 0.3, 0),
                  {
                    direction: [0, 1, 0],
                    color: '#101010',
                    size: 1250,
                    emissionRate: 55,
                    capacity: 384,
                    lifetime: 6,
                    riseSpeed: 1.3,
                  },
                  (s, f, dt) => {
                    s.setAmount(Math.max(0, Math.min(1, (200 - f) / 80)))
                    s.update(dt, f < 200, 0.8)
                  },
                )
              add(
                anchor(2, 0.15, 3),
                {
                  direction: [0, 1, 0],
                  color: '#171717',
                  size: 380,
                  lifetime: 3,
                  riseSpeed: 0.7,
                  capacity: 96,
                  emissionRate: 18,
                },
                (s, _f, dt) => {
                  s.setAmount(0.8)
                  s.update(dt, true, 0.8)
                },
              )
              if (scene === 'explosion')
                // Up to eight burning debris pieces flung around the wreck.
                for (let i = 0; i < 8; i++) {
                  const a = anchor(Math.cos(i) * 3, 0.2, Math.sin(i) * 3)
                  add(a, { direction: [0, 1, 0], color: '#292522', size: 250 }, (s, f, dt) => {
                    a.position.x += dt * Math.cos(i) * 0.5
                    s.update(dt, f < 120 + i * 10, 0.5)
                  })
                }
            }
            const base = update
            update = (f, dt, now) => {
              base(f, dt, now)
              for (const e of emitters) e.tick(f, dt)
            }
          } else if (scene === 'sparks') {
            camera.position.set(0.8, 0.9, 1.6)
            camera.lookAt(0, 0.4, 0)
            const sparks = new Sparks()
            space.add(sparks.root)
            disposers.push(() => sparks.dispose())
            update = (f, _dt, now) => {
              if (f % 3 === 0)
                sparks.add(
                  [Math.sin(f) * 0.3, 0.4, -0.2],
                  now,
                  [0, 0.3, 1],
                  f % 2 ? { count: 4, drift: [0.5, 0, -1], speed: 0.7 } : {},
                )
              sparks.update(now)
            }
          } else if (scene === 'tyre-smoke') {
            camera.position.set(3, 1.5, 3)
            camera.lookAt(0, 0.3, 0)
            const tyres = new Tire()
            world.add(tyres.root)
            disposers.push(() => tyres.dispose())
            const origin = new T.Vector3(0.2, 0, -0.1)
            update = (f, dt) => {
              const x = Math.sin(f / 20)
              tyres.update(
                dt,
                [
                  [x, 0, 0.7],
                  [x, 0, -0.7],
                  [x - 1.4, 0, 0.7],
                ],
                f < 170 ? 0.9 : 0,
                origin,
              )
            }
          } else {
            camera.position.set(0.25, 0.05, 0.25)
            camera.lookAt(0, 0, -0.15)
            const smoke = new Muzzle()
            space.add(smoke.root)
            disposers.push(() => smoke.dispose())
            update = (f, _dt, now) => {
              if (f % 11 === 0) smoke.burst(now, [0, 0, -0.135])
              smoke.update(now)
            }
          }
          const frames = scene === 'sparks' || scene === 'muzzle-smoke' ? 100 : 180
          let now = 10000,
            updateMs = 0,
            calls = 0
          // Only the effects draw from the seeded stream: three's UUIDs also use Math.random.
          const rng = seed(7)
          const tick = (f: number, dt: number, at: number) => {
            Math.random = rng
            update(f, dt, at)
            Math.random = random
          }
          for (let f = 0; f < frames; f++) {
            const dt = steps[f % steps.length]
            now += dt * 1000
            const t0 = performance.now()
            tick(f, dt, now)
            updateMs += performance.now() - t0
            renderer.info.reset()
            renderer.render(world, camera)
            calls = Math.max(calls, renderer.info.render.calls)
          }
          const pixels = new Uint8Array(W * H * 4)
          gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
          // JS cost of the effect updates alone, repeated without rendering for a steadier figure.
          const t1 = performance.now()
          for (let f = frames; f < frames + 600; f++)
            tick(f % frames, steps[f % steps.length], (now += 16.6))
          const steadyMs = (performance.now() - t1) / 600
          const kinds =
            world.children.length +
            ':' +
            space.children.map((c: { type: string }) => c.type).join(',')
          for (const d of disposers) d()
          return { pixels, updateMs: updateMs / frames, steadyMs, calls, kinds }
        }
        const before = run(false)
        const after = run(true)
        let sum = 0,
          max = 0,
          differing = 0,
          lit = 0
        for (let i = 0; i < before.pixels.length; i += 4) {
          let d = 0
          for (let c = 0; c < 3; c++)
            d = Math.max(d, Math.abs(before.pixels[i + c] - after.pixels[i + c]))
          sum += d
          max = Math.max(max, d)
          if (d) differing++
          const rgb = (before.pixels[i] << 16) | (before.pixels[i + 1] << 8) | before.pixels[i + 2]
          if (rgb !== 0x93b7cd && rgb !== 0x4a4d50) lit++
        }
        const png = (px: Uint8Array) => {
          const c = document.createElement('canvas')
          c.width = W
          c.height = H
          const x = c.getContext('2d')!
          const img = x.createImageData(W, H)
          for (let y = 0; y < H; y++)
            img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4)
          x.putImageData(img, 0, 0)
          return c.toDataURL()
        }
        return {
          shots: [png(before.pixels), png(after.pixels)],
          mean: sum / (W * H),
          max,
          differing,
          lit,
          before: {
            updateMs: before.updateMs,
            steadyMs: before.steadyMs,
            calls: before.calls,
            kinds: before.kinds,
          },
          after: {
            updateMs: after.updateMs,
            steadyMs: after.steadyMs,
            calls: after.calls,
            kinds: after.kinds,
          },
        }
      },
      { root: process.cwd(), scene },
    )
    const { shots, ...summary } = result
    if (process.env.NABLA_PARITY_SHOTS) {
      mkdirSync(process.env.NABLA_PARITY_SHOTS, { recursive: true })
      shots.forEach((shot, i) =>
        writeFileSync(
          `${process.env.NABLA_PARITY_SHOTS}/${scene}-${i ? 'gpu' : 'cpu'}.png`,
          Buffer.from(shot.split(',')[1], 'base64'),
        ),
      )
    }
    console.log(`[gpu-particles] ${scene} ${JSON.stringify(summary)}`)
    expect(errors).toEqual([])
    expect(result.lit).toBeGreaterThan(200)
    expect(result.mean).toBeLessThan(0.05)
  })
}
