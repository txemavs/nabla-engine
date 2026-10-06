import { test, expect } from '@playwright/test'

/**
 * Driver steering-wheel adjustment («Volante» sliders): a translation between the authored
 * steering mount and the spin group, shared by every vehicle of the same steering model.
 */
test('steering wheel offset slides along the column and up, per model, keeping the spin pivot', async ({
  page,
}) => {
  await page.route('**/steering-offset', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body style="margin:0"></body>',
    }),
  )
  await page.goto('/steering-offset')
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { SceneView } = await import(`/@fs/${root}/src/presentation/scene-view.ts`)
    const { presetVehicle } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const { poseSteeringWheel, steeringAxis, steeringPivot } = await import(
      `/@fs/${root}/src/render/entity/steering-wheel.ts`
    )
    const { driverHeadPose } = await import(`/@fs/${root}/src/render/entity/driving-camera.ts`)
    type V3 = import('three').Vector3
    type O3 = import('three').Object3D
    const s3 = presetVehicle('car', 's3', [0, 0.55, 0])
    const twin = presetVehicle('car', 's3-twin', [6, 0.55, 0])
    const a3 = presetVehicle('a3', 'a3', [-6, 0.55, 0])
    const truck = presetVehicle('white-truck', 'truck', [0, 1.6, 14])
    const s3Model = s3.visual!.steering!.url
    const truckModel = truck.visual!.steering!.url
    const view = new SceneView(
      {
        version: 1,
        name: 'Wheel',
        entities: [s3, twin, a3, truck, createEntity('spawn', 'spawn')],
      },
      false,
      false,
      // A host default for the tractor, applied when its steering mesh loads.
      {
        steeringWheelOffset: (model: string) =>
          model === truckModel ? { height: 0.03 } : undefined,
      },
    )
    await view.ready
    view.root.updateMatrixWorld(true)
    /** Steering mesh vertices (a sample) in the vehicle's chassis frame. */
    const sample = (id: string): V3[] => {
      const object: O3 = view.objects.get(id)
      object.updateMatrixWorld(true)
      const inverse = object.matrixWorld.clone().invert()
      const points: V3[] = []
      view.steering.get(id).traverse((node: O3) => {
        const mesh = node as import('three').Mesh
        if (!mesh.isMesh) return
        const position = mesh.geometry.getAttribute('position')
        for (let i = 0; i < position.count; i += Math.max(1, Math.floor(position.count / 40)))
          points.push(
            new T.Vector3()
              .fromBufferAttribute(position, i)
              .applyMatrix4(mesh.matrixWorld)
              .applyMatrix4(inverse),
          )
      })
      return points
    }
    /** Largest deviation of `after - before` from `expected` over all sampled vertices. */
    const shiftError = (before: V3[], after: V3[], expected: V3) =>
      Math.max(...before.map((p, i) => after[i].clone().sub(p).sub(expected).length()))
    const columnAxis = (entity: typeof s3) =>
      steeringAxis(entity.visual!.steering!.axis).applyQuaternion(
        new T.Quaternion().fromArray(entity.visual!.steering!.transform.rotation),
      )

    // Driver-view screenshot helper: the S3 eyes from its GLB anchors, default head pitch.
    const renderer = new T.WebGLRenderer({ antialias: true })
    renderer.setSize(1100, 750)
    renderer.setClearColor('#b9cfdf')
    document.body.replaceChildren(renderer.domElement)
    const scene = new T.Scene()
    scene.add(new T.HemisphereLight(0xffffff, 0x666666, 2.2))
    const sun = new T.DirectionalLight(0xffffff, 2.5)
    sun.position.set(-3, 6, 4)
    scene.add(sun, view.root)
    const camera = new T.PerspectiveCamera(70, 1100 / 750, 0.02, 200)
    const head = driverHeadPose(
      new T.Vector3()
        .fromArray(s3.vehicle!.driver!)
        .add(new T.Vector3().fromArray(s3.transform.position))
        .toArray(),
      [0, 0, 0, 1],
      false,
      0,
      undefined,
      s3.vehicle!.headOffset,
      s3.vehicle!.headRotation,
    )
    camera.position.copy(head.position)
    camera.quaternion.copy(head.quaternion)
    const shoot = () => renderer.render(scene, camera)

    const truckStart = view.steeringWheelOffset(truckModel)
    const before = { s3: sample('s3'), twin: sample('s3-twin'), a3: sample('a3') }
    shoot()
    ;(window as unknown as { shots: string[] }).shots = [renderer.domElement.toDataURL('image/png')]

    const applied = view.setSteeringWheelOffset(s3Model, { distance: -0.06, height: 0.03 })
    view.root.updateMatrixWorld(true)
    const expected = columnAxis(s3)
      .multiplyScalar(-0.06)
      .add(new T.Vector3(0, 0.03, 0))
    const after = { s3: sample('s3'), twin: sample('s3-twin'), a3: sample('a3') }
    shoot()
    ;(window as unknown as { shots: string[] }).shots.push(
      renderer.domElement.toDataURL('image/png'),
    )

    // Steering still turns the rim about its own (moved) column: with and without the offset the
    // turned vertices differ by the same constant translation.
    // The S3 GLB declares its baked spin pivot; SceneView spins about it the same way.
    const pivot = steeringPivot(view.steering.get('s3'))
    poseSteeringWheel(view.steering.get('s3'), steeringAxis(s3.visual!.steering!.axis), 0.3, pivot)
    view.root.updateMatrixWorld(true)
    const turnedWithOffset = sample('s3')
    view.setSteeringWheelOffset(s3Model, { distance: 0, height: 0 })
    view.root.updateMatrixWorld(true)
    const turnedCentred = sample('s3')

    const clamped = view.setSteeringWheelOffset(s3Model, { distance: 0.2, height: -0.0123 })
    return {
      applied,
      clamped,
      truckStart,
      models: [view.steeringWheelModel('s3'), view.steeringWheelModel('a3')],
      s3Error: shiftError(before.s3, after.s3, expected),
      twinError: shiftError(before.twin, after.twin, expected),
      a3Error: shiftError(before.a3, after.a3, new T.Vector3()),
      spinError: shiftError(turnedCentred, turnedWithOffset, expected),
      // Sanity: the column runs forward (-Z) and down toward the dashboard, about 21° off level.
      column: columnAxis(s3).toArray(),
      pivot: pivot?.toArray(),
      vertices: before.s3.length,
    }
  }, process.cwd())
  const shots = await page.evaluate(() => (window as unknown as { shots: string[] }).shots)
  const { writeFileSync, mkdirSync } = await import('node:fs')
  mkdirSync('test-results', { recursive: true })
  shots.forEach((url, i) =>
    writeFileSync(
      `test-results/wheel-slider-${i ? 'after' : 'before'}.png`,
      Buffer.from(url.split(',')[1], 'base64'),
    ),
  )
  console.log('Steering wheel offset', result)
  expect(errors).toEqual([])
  expect(result.vertices).toBeGreaterThan(20)
  expect(result.models[0]).toMatch(/s3\.steering\.glb$/)
  expect(result.models[1]).toMatch(/a3\.steering\.glb$/)
  expect(result.applied).toEqual({ distance: -0.06, height: 0.03 })
  expect(result.clamped).toEqual({ distance: 0.08, height: -0.01 })
  expect(result.truckStart).toEqual({ distance: 0, height: 0.03 })
  expect(result.pivot?.[1]).toBeCloseTo(0.0232, 4)
  expect(result.column[2]).toBeLessThan(-0.9)
  expect(result.column[1]).toBeLessThan(0)
  expect(result.s3Error).toBeLessThan(1e-5)
  expect(result.twinError).toBeLessThan(1e-5)
  expect(result.a3Error).toBeLessThan(1e-9)
  expect(result.spinError).toBeLessThan(1e-5)
})
