import { test, expect } from '@playwright/test'
import { writeFileSync } from 'node:fs'

test('real S3 glass breaks and runtime renders a burning, disabled vehicle', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && /shader|WebGLProgram/i.test(message.text()))
      errors.push(message.text())
  })
  await page.route('**/vehicle-destruction', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body style="margin:0"><canvas style="width:800px;height:600px"></canvas></body>',
    }),
  )
  await page.goto('/vehicle-destruction')
  const result = await page.evaluate(async (root) => {
    const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const { presetVehicle } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
    const floor = createEntity('floor', 'box', [0, 0.5, 0])
    floor.size = [100, 1, 100]
    const runtime = new GameRuntime({
      canvas: document.querySelector('canvas')!,
      clock: 'manual',
      sea: false,
      audio: false,
      scene: {
        version: 1,
        name: 'Destruction',
        geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
        entities: [
          floor,
          createEntity('spawn', 'spawn', [8, 1.7, 4]),
          presetVehicle('car', 'car', [0, 1.7, 0]),
        ],
      },
    })
    await runtime.play()
    const view = (
      runtime as unknown as { view: import('../../../src/render/entity/view').SceneView }
    ).view
    await view.ready
    const sim = (
      runtime as unknown as {
        session: { simulation: import('../../../src/simulation/simulation').Simulation }
      }
    ).session.simulation
    const car = view.objects.get('car')!
    car.updateWorldMatrix(true, true)
    let paneBroken = false
    let restored = false
    let glassName = ''
    let bulletBreaksGlass = false
    const materialNames: string[] = []
    car.traverse((object) => {
      if (paneBroken || !(object as import('three').Mesh).isMesh) return
      const mesh = object as import('three').Mesh
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      materialNames.push(...materials.map((material) => material.name))
      const geometry = mesh.geometry
      const groups = geometry.groups.length
        ? geometry.groups
        : [
            {
              start: 0,
              count: geometry.index?.count ?? geometry.getAttribute('position').count,
              materialIndex: 0,
            },
          ]
      const group = groups.find((group) =>
        /glass|vidrio|cristal|parabrisas|windscreen|window/i.test(
          materials[group.materialIndex ?? 0]?.name ?? '',
        ),
      )
      if (!group) return
      glassName = materials[group.materialIndex ?? 0].name
      const positions = geometry.getAttribute('position')
      const vertex = (i: number) => (geometry.index ? geometry.index.getX(i) : i)
      const a = mesh.position.clone().fromBufferAttribute(positions, vertex(group.start))
      const b = mesh.position.clone().fromBufferAttribute(positions, vertex(group.start + 1))
      const c = mesh.position.clone().fromBufferAttribute(positions, vertex(group.start + 2))
      const point = a
        .clone()
        .add(b)
        .add(c)
        .multiplyScalar(1 / 3)
        .applyMatrix4(mesh.matrixWorld)
      const normal = b.sub(a).cross(c.sub(a)).normalize().transformDirection(mesh.matrixWorld)
      const hit = view.brokenGlass.hit(
        [mesh],
        point.clone().addScaledVector(normal, 0.05),
        normal.negate(),
        0.1,
      )
      paneBroken = !!hit && mesh.geometry.index!.count < (geometry.index?.count ?? positions.count)
      if (hit) view.destruction.glass(hit.clone().sub(view.root.position), normal)
      view.brokenGlass.clear()
      restored = mesh.geometry === geometry
      const camera = (
        runtime as unknown as { camera: import('three').PerspectiveCamera }
      ).camera.clone()
      camera.position.copy(point).addScaledVector(normal, -0.05).sub(view.root.position)
      camera.lookAt(point.clone().sub(view.root.position))
      camera.updateMatrixWorld(true)
      const gallery = (
        runtime as unknown as { gallery: import('../../../src/runtime/gallery').Gallery }
      ).gallery
      gallery.shoot(sim, view, camera, 0.1, 0, 12)
      bulletBreaksGlass = !!gallery.lastGlassImpact && sim.vehicleDamage('car').health === 100
      view.brokenGlass.clear()
    })
    const originalMaterials = new Map<
      import('three').Mesh,
      import('three').Material | import('three').Material[]
    >()
    car.traverse((object) => {
      if ((object as import('three').Mesh).isMesh)
        originalMaterials.set(
          object as import('three').Mesh,
          (object as import('three').Mesh).material,
        )
    })
    const renderer = (runtime as unknown as { renderer: import('three').WebGLRenderer }).renderer
    runtime.tick(performance.now())
    runtime.tick(performance.now() + 16)
    const programKeysBefore = new Set(renderer.info.programs?.map((p) => p.cacheKey))
    const programsBefore = renderer.info.programs?.length ?? 0
    sim.damageVehicle('car', 100)
    const now = performance.now()
    runtime.tick(now)
    runtime.tick(now + 16)
    const firstExplosionMs = performance.now() - now
    const programsAfter = renderer.info.programs?.length ?? 0
    const burning = car.children.some(
      (child) =>
        (child as import('three').Mesh).isMesh &&
        (child as import('three').Mesh).material &&
        child.visible,
    )
    const effectCount = view.destruction.root.children.length
    const disabled = sim.vehicleDamage('car').destroyed && sim.vehicleInfo('car').rpm === 0
    const keptMaterials = [...originalMaterials].every(
      ([mesh, material]) => mesh.material === material,
    )
    for (let i = 0; i < 8; i++) view.destruction.update(0.1, true)
    const flamesVisible = view.root.children.some(
      (child) => child.name === 'Wreck flames' && child.visible,
    )
    const graphics = runtime as unknown as {
      camera: import('three').PerspectiveCamera
      renderer: import('three').WebGLRenderer
      scene: import('three').Scene
    }
    const camera = graphics.camera.clone()
    const target = car.getWorldPosition(car.position.clone())
    camera.position.copy(target).add(car.position.clone().set(5, 3, 7))
    camera.lookAt(target)
    camera.updateMatrixWorld(true)
    graphics.renderer.render(graphics.scene, camera)
    const image = graphics.renderer.domElement.toDataURL('image/png').split(',')[1]
    runtime.stop()
    const cleared = view.destruction.root.children.length === 2
    runtime.dispose()
    return {
      paneBroken,
      bulletBreaksGlass,
      restored,
      glassName,
      materialNames,
      burning,
      flamesVisible,
      effectCount,
      disabled,
      keptMaterials,
      firstExplosionMs,
      newPrograms: programsAfter - programsBefore,
      newProgramKeys: renderer.info.programs
        ?.filter((p) => !programKeysBefore.has(p.cacheKey))
        .map((p) => p.cacheKey),
      cleared,
      image,
    }
  }, process.cwd())
  writeFileSync('test-results/vehicle-explosion.png', Buffer.from(result.image, 'base64'))
  result.image = ''
  console.log(
    'First explosion:',
    result.firstExplosionMs.toFixed(1),
    'ms; new shader programs:',
    result.newPrograms,
  )
  expect(result.paneBroken, JSON.stringify(result)).toBe(true)
  expect(result.restored).toBe(true)
  expect(result.bulletBreaksGlass).toBe(true)
  expect(result.burning).toBe(true)
  expect(result.flamesVisible).toBe(true)
  expect(result.effectCount).toBeGreaterThan(2)
  expect(result.disabled).toBe(true)
  expect(result.keptMaterials).toBe(true)
  expect(result.newPrograms, JSON.stringify(result.newProgramKeys)).toBe(0)
  expect(result.cleared).toBe(true)
  expect(errors).toEqual([])
})
