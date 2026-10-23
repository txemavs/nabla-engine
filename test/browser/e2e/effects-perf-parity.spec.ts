import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Headless SwiftShader WebGL: pixels, draw calls, uploaded bytes and JS timings, not GPU timings.
// Each scene runs twice in one page with a fixed clock and seeded Math.random: once with the
// effects at the base commit (BASE, imported from a git worktree) and once with the current
// tree. The frames must match. Draws are counted at the GL call (a draw with no primitives does
// not count as effective), bytes at bufferData/bufferSubData.
// The base is the last commit that changed the look on purpose: after 83ed9e6e the GPU explosions
// (7c70f728), soft particles and procedural fire (2679074b) and lingering fire (afb5e13d) redrew
// the burning car and the glass; every scene matches afb5e13d at the same limit.
const BASE = process.env.NABLA_PARITY_BASE ?? 'afb5e13d'
const root = process.cwd()
const before = resolve(root, 'node_modules/.cache/nabla-parity-base')
const scenes = [
  'tyre-marks',
  'tyre-marks-wrap',
  'impacts-wall',
  'impacts-car',
  'burning-car',
  'burning-car-offset',
  'glass',
  'behind-camera',
]

test.beforeAll(() => {
  if (!existsSync(before)) {
    mkdirSync(resolve(before, '..'), { recursive: true })
    execFileSync('git', ['worktree', 'add', '--detach', before, BASE], { stdio: 'ignore' })
  } else execFileSync('git', ['-C', before, 'checkout', '--detach', BASE], { stdio: 'ignore' })
})

for (const scene of scenes) {
  test(`effects perf keeps the picture: ${scene}`, async ({ page }) => {
    test.setTimeout(240000)
    await page.route('**/effects-perf-test', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0"></body>',
      }),
    )
    await page.goto('/effects-perf-test')
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 2000))
    })
    const result = await page.evaluate(
      async ({ root, before, scene }) => {
        const T = await import(`/@fs/${root}/node_modules/three/build/three.module.js`)
        const load = async (base: string) => ({
          TireMarks: (await import(`/@fs/${base}/src/render/entity/tire-marks.ts`)).TireMarks,
          ImpactMarks: (await import(`/@fs/${base}/src/render/entity/impact-marks.ts`)).ImpactMarks,
          VehicleDestruction: (
            await import(`/@fs/${base}/src/render/entity/vehicle-destruction.ts`)
          ).VehicleDestruction,
          ShotSparks: (await import(`/@fs/${base}/src/render/entity/shot-sparks.ts`)).ShotSparks,
          ShotTracers: (await import(`/@fs/${base}/src/render/entity/shot-tracers.ts`)).ShotTracers,
          TireSmoke: (await import(`/@fs/${base}/src/render/entity/tire-smoke.ts`)).TireSmoke,
        })
        const versions = { before: await load(before), after: await load(root) }
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
        const gl = renderer.getContext() as WebGL2RenderingContext

        // GL accounting.
        const stats = { draws: 0, effective: 0, bytes: 0 }
        const wrap = (
          name: string,
          count: (a: IArguments) => number,
          instances = (_: IArguments) => 1,
        ) => {
          const g = gl as unknown as Record<string, (...a: unknown[]) => unknown>
          const original = g[name].bind(gl)
          g[name] = function (...args: unknown[]) {
            stats.draws++
            // eslint-disable-next-line prefer-rest-params
            if (count(arguments) > 0 && instances(arguments) > 0) stats.effective++
            return original(...args)
          }
        }
        wrap('drawArrays', (a) => a[2])
        wrap('drawElements', (a) => a[1])
        wrap(
          'drawArraysInstanced',
          (a) => a[2],
          (a) => a[3],
        )
        wrap(
          'drawElementsInstanced',
          (a) => a[1],
          (a) => a[4],
        )
        {
          const g = gl as unknown as Record<string, (...a: unknown[]) => unknown>
          const data = g.bufferData.bind(gl)
          g.bufferData = (...a: unknown[]) => {
            const src = a[1] as ArrayBufferView | number
            stats.bytes += typeof src === 'number' ? 0 : src.byteLength
            return data(...a)
          }
          const sub = g.bufferSubData.bind(gl)
          g.bufferSubData = (...a: unknown[]) => {
            const src = a[2] as ArrayBufferView
            const per = (src as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1
            stats.bytes +=
              a[4] !== undefined
                ? (a[4] as number) * per
                : src.byteLength - ((a[3] as number) ?? 0) * per
            return sub(...a)
          }
        }

        // Deterministic Math.random (mulberry32). three's UUIDs draw from Math.random too and the
        // two versions create different numbers of objects, so UUIDs get their own stream.
        const seed = (s: number) => () => {
          s |= 0
          s = (s + 0x6d2b79f5) | 0
          let t = Math.imul(s ^ (s >>> 15), 1 | s)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
        const steps = [1 / 60, 1 / 60, 1 / 30, 1 / 45, 0.07, 1 / 60, 1 / 120]
        const pixels = () => {
          const out = new Uint8Array(W * H * 4)
          gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, out)
          return out
        }

        type Version = (typeof versions)['after']
        const run = (V: Version) => {
          const effects = seed(1234)
          const uuids = seed(99)
          const random = Math.random
          Math.random = () => (new Error().stack?.includes('generateUUID') ? uuids() : effects())
          const world = new T.Scene()
          world.background = new T.Color('#93b7cd')
          world.add(new T.AmbientLight('#ffffff', 1.5))
          const space = new T.Group()
          world.add(space)
          const ground = new T.Mesh(
            new T.PlaneGeometry(80, 80).rotateX(-Math.PI / 2),
            new T.MeshBasicMaterial({ color: '#4a4d50' }),
          )
          space.add(ground)
          const camera = new T.PerspectiveCamera(55, W / H, 0.05, 500)
          const shots: Uint8Array[] = []
          const checkpoints: number[] = []
          let frames = 0
          let update: (f: number, dt: number) => void = () => undefined
          let aim: (f: number) => void = () => undefined
          const disposers: (() => void)[] = []
          let updateMs = 0,
            renderMs = 0,
            bytes = 0,
            effective = 0,
            draws = 0,
            measured = 0
          let measureFrom = 0
          const car = (color: string) => {
            const g = new T.Group()
            const body = new T.Mesh(
              new T.BoxGeometry(1.8, 1.1, 4),
              new T.MeshStandardMaterial({ color, roughness: 0.6 }),
            )
            body.name = 'Body'
            body.position.y = 0.75
            g.add(body)
            for (const [x, z] of [
              [-0.9, 1.3],
              [0.9, 1.3],
              [-0.9, -1.3],
              [0.9, -1.3],
            ]) {
              const wheel = new T.Mesh(
                new T.CylinderGeometry(0.35, 0.35, 0.25, 12).rotateZ(Math.PI / 2),
                new T.MeshStandardMaterial({ color: '#111111' }),
              )
              wheel.name = 'Wheel'
              wheel.position.set(x, 0.35, z)
              g.add(wheel)
            }
            const door = new T.Mesh(
              new T.BoxGeometry(0.05, 0.8, 1.2),
              new T.MeshStandardMaterial({ color }),
            )
            door.name = 'Door_L'
            door.position.set(-0.93, 0.8, 0.3)
            g.add(door)
            return g
          }
          const drift =
            (marks: InstanceType<Version['TireMarks']>, radius: number, cx = 0, cz = 0) =>
            (f: number, dt: number) => {
              const a = f * 0.025
              const cos = Math.cos(a),
                sin = Math.sin(a)
              const contacts = [
                [-0.8, 1.3],
                [0.8, 1.3],
                [-0.8, -1.3],
                [0.8, -1.3],
              ].map(([side, along], w) => {
                // Heading tangent to the circle; wheels around the centre of the car.
                const r = radius + side
                const t = a + along / radius
                return {
                  contactPoint: [cx + Math.cos(t) * r, 0, cz + Math.sin(t) * r] as [
                    number,
                    number,
                    number,
                  ],
                  contactNormal: [0, 1, 0] as [number, number, number],
                  slip: 0.5 + 0.5 * Math.abs(Math.sin(f / 37 + w)),
                  surface: (f % 300 < 150 ? 'asphalt' : 'grass') as 'asphalt' | 'grass',
                }
              })
              void cos
              void sin
              marks.update(dt, 'car', contacts, new T.Vector3())
            }

          if (scene === 'tyre-marks' || scene === 'tyre-marks-wrap') {
            const marks = new V.TireMarks(scene === 'tyre-marks' ? 2048 : 96, 20)
            space.add(marks.root)
            disposers.push(() => marks.dispose())
            camera.position.set(0, 22, 16)
            camera.lookAt(0, 0, 0)
            update = drift(marks, 8)
            frames = scene === 'tyre-marks' ? 400 : 700
            checkpoints.push(...(scene === 'tyre-marks' ? [120, 260, 399] : [300, 500, 699]))
            measureFrom = 100
          } else if (scene === 'impacts-wall') {
            const wall = new T.Mesh(
              new T.PlaneGeometry(8, 4),
              new T.MeshBasicMaterial({ color: '#8a8580' }),
            )
            wall.position.set(0, 2, -3)
            space.add(wall)
            const marks = new V.ImpactMarks()
            disposers.push(() => marks.dispose())
            camera.position.set(0, 1.5, -2.45)
            camera.lookAt(0, 1.5, -3)
            update = (f) => {
              // 120 hits (past the 96 limit), clustered so marks overlap.
              if (f < 120) {
                const r = 0.18 * Math.sqrt(Math.random()),
                  t = Math.random() * Math.PI * 2
                marks.addWorld(space, [Math.cos(t) * r, 1.5 + Math.sin(t) * r, -3], [0, 0, 1])
              }
            }
            frames = 160
            checkpoints.push(60, 119, 159)
            measureFrom = 120
          } else if (scene === 'impacts-car') {
            const marks = new V.ImpactMarks()
            disposers.push(() => marks.dispose())
            const a = car('#7d2a22'),
              b = car('#2a4d7d')
            a.position.set(0, 0, 0)
            b.position.set(3.2, 0, -1)
            space.add(a, b)
            const wall = new T.Mesh(
              new T.PlaneGeometry(10, 4),
              new T.MeshBasicMaterial({ color: '#8a8580' }),
            )
            wall.position.set(0, 2, -5)
            space.add(wall)
            update = (f, dt) => {
              // The cars drive and turn; marks must ride with them.
              a.position.z += dt * 2.5
              a.rotation.y = Math.sin(f / 50) * 0.4
              b.position.x -= dt * 1.2
              b.rotation.y += dt * 0.3
              world.updateMatrixWorld(true)
              if (f < 90) {
                const target = f % 3 === 0 ? b : a
                const body = target.children[0]
                const side = f % 2 ? 0.9 : -0.9
                const local = new T.Vector3(
                  side + Math.sign(side) * 0.001,
                  0.5 + Math.random() * 0.5,
                  Math.random() * 3 - 1.5,
                )
                const point = body.localToWorld(local.clone().sub(body.position).add(body.position))
                const normal = new T.Vector3(Math.sign(side), 0, 0).transformDirection(
                  target.matrixWorld,
                )
                if (f % 2)
                  marks.add(
                    target,
                    { position: target.position.toArray(), rotation: target.quaternion.toArray() },
                    point.toArray(),
                    normal.toArray(),
                  )
                else marks.addSurface(body, point.toArray(), normal.toArray())
                if (f % 5 === 0)
                  marks.addWorld(
                    space,
                    [Math.random() * 4 - 2, 1 + Math.random() * 2, -5],
                    [0, 0, 1],
                  )
              }
              if (f === 100) marks.removeFor(b)
            }
            aim = (f) => {
              camera.position.set(a.position.x - 4.5, 1.6, a.position.z + 1)
              camera.lookAt(a.position.x, 0.8, a.position.z - (f > 100 ? 0.5 : 0))
            }
            frames = 160
            checkpoints.push(45, 89, 99, 159)
            measureFrom = 100
          } else if (scene.startsWith('burning-car') || scene === 'glass') {
            const destruction = new V.VehicleDestruction(space)
            space.add(destruction.root)
            disposers.push(() => destruction.dispose())
            const wreck = car('#5a5f63')
            // 'burning-car' puts the wreck on the space origin, where the shared smoke draw has
            // its fixed sort centre (worst case for draw order); '-offset' 12 m away from it.
            const at = new T.Vector3(...(scene === 'burning-car-offset' ? [9, 0, -8] : [0, 0, 0]))
            wreck.position.copy(at)
            space.add(wreck)
            if (scene.startsWith('burning-car')) {
              destruction.explode('car', wreck)
              // Orbit so the tongues' depth order changes between checkpoints.
              aim = (f) => {
                const t = f * 0.021
                camera.position.set(at.x + Math.sin(t) * 4, 1.8, at.z + Math.cos(t) * 4)
                camera.lookAt(at.x, 1.1, at.z)
              }
              frames = 360
              checkpoints.push(12, 40, 80, 130, 200, 260, 330, 359)
              measureFrom = 60
            } else {
              aim = () => {
                camera.position.set(0, 1.8, 5.5)
                camera.lookAt(0, 1, 0)
              }
              update = (f) => {
                if (f % 20 === 0 && f < 140)
                  destruction.glass(
                    new T.Vector3(-0.9 + (f % 40) / 22, 1.3, 1.5),
                    new T.Vector3(f % 40 ? 1 : -1, 0.3, 0.6).normalize(),
                  )
              }
              frames = 200
              checkpoints.push(10, 35, 70, 125, 199)
              measureFrom = 20
            }
            const tick = update
            update = (f, dt) => {
              tick(f, dt)
              destruction.update(dt, true)
            }
          } else if (scene === 'behind-camera') {
            // Everything happens behind the camera: the frame is the background in both, and
            // the culled effects should no longer reach the GPU.
            const marks = new V.TireMarks(2048, 20)
            const impacts = new V.ImpactMarks()
            const destruction = new V.VehicleDestruction(space)
            const sparks = new V.ShotSparks()
            const tracers = new V.ShotTracers()
            const smoke = new V.TireSmoke()
            space.add(marks.root, destruction.root, sparks.root, tracers.root, smoke.root)
            disposers.push(
              () => marks.dispose(),
              () => impacts.dispose(),
              () => destruction.dispose(),
              () => sparks.dispose(),
              () => tracers.dispose(),
              () => smoke.dispose(),
            )
            const wreck = car('#5a5f63')
            wreck.position.set(0, 0, 25)
            space.add(wreck)
            destruction.explode('car', wreck)
            const tyres = drift(marks, 6, 0, 25)
            camera.position.set(0, 3, 10)
            camera.lookAt(0, 2, -10)
            let now = 1000
            update = (f, dt) => {
              now += dt * 1000
              tyres(f, dt)
              smoke.update(
                dt,
                [
                  [2, 0, 25],
                  [-2, 0, 25],
                ],
                0.8,
                new T.Vector3(),
              )
              if (f < 96) impacts.addWorld(space, [Math.random() * 4 - 2, 1.5, 22], [0, 0, 1])
              if (f % 15 === 0) {
                destruction.glass(new T.Vector3(0, 1.3, 24), new T.Vector3(0, 0.3, 1))
                sparks.add([0, 1, 22], now, [0, 0, 1], { surface: 'metal', incoming: [0, 0, -1] })
                tracers.add([0, 1.5, 30], [0, 1, 22], now)
              }
              destruction.update(dt, true)
              sparks.update(now)
              tracers.update(now)
            }
            frames = 240
            checkpoints.push(60, 150, 239)
            measureFrom = 100
          }

          for (let f = 0; f < frames; f++) {
            const dt = steps[f % steps.length]
            const t0 = performance.now()
            update(f, dt)
            const t1 = performance.now()
            aim(f)
            const s0 = { ...stats }
            renderer.render(world, camera)
            const t2 = performance.now()
            if (f >= measureFrom) {
              updateMs += t1 - t0
              renderMs += t2 - t1
              bytes += stats.bytes - s0.bytes
              effective += stats.effective - s0.effective
              draws += stats.draws - s0.draws
              measured++
            }
            if (checkpoints.includes(f)) shots.push(pixels())
          }
          Math.random = random
          for (const d of disposers) d()
          return {
            shots,
            checkpoints,
            perFrame: {
              updateMs: updateMs / measured,
              renderMs: renderMs / measured,
              bytes: bytes / measured,
              effectiveDraws: effective / measured,
              draws: draws / measured,
            },
          }
        }

        const a = run(versions.before)
        const b = run(versions.after)
        const diffs = a.shots.map((shot, k) => {
          const other = b.shots[k]
          let sum = 0,
            max = 0,
            changed = 0
          for (let i = 0; i < shot.length; i += 4)
            for (let c = 0; c < 3; c++) {
              const d = Math.abs(shot[i + c] - other[i + c])
              sum += d
              max = Math.max(max, d)
              if (d) changed++
            }
          return { frame: a.checkpoints[k], mean: sum / ((shot.length / 4) * 3), max, changed }
        })
        // Side-by-side PNG of the checkpoint that differs most (before | after | difference ×8),
        // flipped upright.
        let worst = diffs.length - 1
        diffs.forEach((d, k) => {
          if (d.mean > diffs[worst].mean) worst = k
        })
        const png = (() => {
          const c = document.createElement('canvas')
          c.width = W * 3
          c.height = H
          const ctx = c.getContext('2d')!
          const delta = a.shots[worst].map((v, i) =>
            i % 4 === 3 ? 255 : Math.min(255, 8 * Math.abs(v - b.shots[worst][i])),
          )
          for (const [x, shot] of [
            [0, a.shots[worst]],
            [W, b.shots[worst]],
            [2 * W, delta],
          ] as const) {
            const image = ctx.createImageData(W, H)
            for (let y = 0; y < H; y++)
              image.data.set(shot.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4)
            ctx.putImageData(image, x, 0)
          }
          return c.toDataURL('image/png')
        })()
        return { diffs, worst: diffs[worst].frame, before: a.perFrame, after: b.perFrame, png }
      },
      { root, before, scene },
    )
    expect(errors).toEqual([])
    const out = resolve(root, 'test-results/effects-perf')
    mkdirSync(out, { recursive: true })
    writeFileSync(resolve(out, `${scene}.png`), Buffer.from(result.png.split(',')[1], 'base64'))
    const report = {
      scene,
      worstFrame: result.worst,
      diffs: result.diffs,
      before: result.before,
      after: result.after,
    }
    writeFileSync(resolve(out, `${scene}.json`), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report))
    for (const d of result.diffs) expect(d.mean, `frame ${d.frame}`).toBeLessThan(0.05)
  })
}
