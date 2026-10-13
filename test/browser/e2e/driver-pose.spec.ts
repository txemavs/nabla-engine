import { test, expect } from '@playwright/test'
import type { DriverPoseAdjustment } from '../../../src/config/driver-pose.js'
test('Ferrari head sliders update the avatar offset, view sliders remain separate and reset restores both', async ({
  page,
}) => {
  await page.route('**/driver-pose-preview', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/driver-pose-preview')
  const result = await page.evaluate(async (root) => {
    const { SceneView } = await import(`/@fs/${root}/src/presentation/scene-view.ts`)
    const { presetVehicle } = await import(`/@fs/${root}/src/catalog/vehicles/library.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const { driverPoseControls } = await import(`/@fs/${root}/game/driver-pose-controls.ts`)
    const car = presetVehicle('ferrari-j50', 'ferrari', [0, 0.6, 0])
    const document = { version: 1, name: 'Driver', entities: [createEntity('spawn', 'spawn'), car] }
    const view = new SceneView(document)
    await view.ready
    const model = car.visual.body.url
    const panel = driverPoseControls()
    window.document.body.append(panel.root)
    panel.bind({
      get driverPose() {
        return { name: 'Ferrari J50', model, offset: view.driverPoseAdjustment(model) }
      },
      setDriverPoseOffset: (offset: DriverPoseAdjustment) =>
        view.setDriverPoseAdjustment(model, offset),
      resetDriverPoseOffset: () =>
        view.setDriverPoseAdjustment(model, { head: [0, 0, 0], view: [0, 0, 0] }),
    })
    const before = [...view.vehicleHeadOffset('ferrari')!]
    const set = (id: string, value: string) => {
      const input = window.document.getElementById(id) as HTMLInputElement
      input.value = value
      input.dispatchEvent(new Event('input'))
    }
    set('driver-pose-head-1', '-25')
    set('driver-pose-head-2', '10')
    const head = [...view.vehicleHeadOffset('ferrari')!]
    set('driver-pose-view-1', '-10')
    const unchangedHead = [...view.vehicleHeadOffset('ferrari')!]
    const eye = [...view.vehicleCameraOffset('ferrari')!]
    const serialized = JSON.parse(panel.root.querySelector('textarea')!.value)
    ;(panel.root.querySelector('button') as HTMLButtonElement).click()
    const resetHead = [...view.vehicleHeadOffset('ferrari')!]
    const resetEye = [...view.vehicleCameraOffset('ferrari')!]
    view.dispose()
    return { before, head, unchangedHead, eye, serialized, resetHead, resetEye }
  }, process.cwd())
  expect(result.head[1] - result.before[1]).toBeCloseTo(-0.25)
  expect(result.head[2] - result.before[2]).toBeCloseTo(-0.1)
  expect(result.unchangedHead).toEqual(result.head)
  expect(result.eye[1] - result.head[1]).toBeCloseTo(-0.1)
  expect(result.serialized.offsets.head[1]).toBe(-0.25)
  expect(result.resetHead).toEqual(result.before)
  expect(result.resetEye).toEqual(result.before)
})
