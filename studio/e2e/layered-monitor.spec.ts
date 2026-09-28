import { test, expect } from '@playwright/test'

test('layers keep textures unchanged when needles, bars and batched digits change', async ({
  page,
}) => {
  await page.route('**/layers-preview', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }),
  )
  await page.goto('/layers-preview')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { LayeredMonitor } = await import(`/@fs${root}/src/render/monitors/layered-monitor.ts`)
    const { carMenuDefinition, carMenuItems } = await import(
      `/@fs${root}/src/catalog/monitors/car.ts`
    )
    const { MonitorMenu } = await import(`/@fs${root}/src/render/monitors/menu.ts`)
    const c = document.createElement('canvas')
    c.width = 100
    c.height = 100
    const ctx = c.getContext('2d')!
    ctx.fillStyle = 'red'
    ctx.fillRect(48, 0, 4, 50)
    const png = c.toDataURL('image/png')
    const panel = new LayeredMonitor({
      width: 600,
      height: 400,
      layers: [
        { id: 'bg', kind: 'panel', x: 0, y: 0, width: 600, height: 400, color: '#10141e' },
        {
          id: 'needle',
          kind: 'needle',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          url: png,
          pivot: [50, 50],
          binding: 'rpm',
          min: 0,
          max: 7000,
          fromDegrees: -90,
          toDegrees: 90,
        },
        {
          id: 'digits',
          kind: 'text',
          x: 180,
          y: 140,
          width: 240,
          height: 100,
          binding: 'speed',
          columns: 3,
          font: 'sans',
          align: 'center',
        },
        {
          id: 'bar',
          kind: 'bar',
          x: 40,
          y: 300,
          width: 520,
          height: 20,
          color: '#ff3344',
          binding: 'rpm',
        },
      ],
    })
    await panel.ready
    panel.update({ values: { speed: 120, rpm: 3500 }, bars: { rpm: 0.5 } }, 0)
    const versions: number[] = []
    panel.root.traverse((o: import('three').Object3D) => {
      const m = o as import('three').Mesh
      if (m.isMesh) {
        const mat = m.material as import('three').MeshBasicMaterial
        if (mat.map) versions.push(mat.map.version)
      }
    })
    panel.update({ values: { speed: 250, rpm: 7000 }, bars: { rpm: 1 } }, 100)
    const after: number[] = []
    panel.root.traverse((o: import('three').Object3D) => {
      const m = o as import('three').Mesh
      if (m.isMesh) {
        const mat = m.material as import('three').MeshBasicMaterial
        if (mat.map) after.push(mat.map.version)
      }
    })
    const offsets = [7, 70, 250].map((speed) => {
      panel.update({ values: { speed, rpm: 7000 }, bars: { rpm: 1 } }, 200)
      return panel.root.getObjectByName('digits').children[0].position.x
    })
    const angle = panel.root.getObjectByName('needle').rotation.z
    const renderer = new T.WebGLRenderer()
    renderer.setSize(900, 600)
    document.body.append(renderer.domElement)
    const scene = new T.Scene()
    const camera = new T.PerspectiveCamera(45, 1.5, 1, 2000)
    camera.position.z = 600
    scene.add(panel.root)
    renderer.render(scene, camera)
    const calls = renderer.info.render.calls
    const menuPanel = new LayeredMonitor(carMenuDefinition)
    await menuPanel.ready
    const menu = new MonitorMenu(carMenuItems)
    menu.open = true
    menu.key('ArrowDown')
    panel.root.visible = false
    scene.add(menuPanel.root)
    menuPanel.update(
      {
        values: { ...menu.lines, title: 'NABLA / CARROCERIA', help: 'ARRIBA/ABAJO ENTER J: SALIR' },
        bars: {},
      },
      0,
    )
    renderer.render(scene, camera)
    const menuCalls = renderer.info.render.calls
    return { versions, after, angle, calls, menuCalls, offsets }
  }, process.cwd())
  expect(result.versions).toEqual(result.after)
  expect(result.offsets).toEqual([50, 25, 0])
  expect(result.angle).toBeCloseTo(-Math.PI / 2)
  expect(result.calls).toBe(4)
  expect(result.menuCalls).toBeLessThanOrEqual(9)
  await page.screenshot({ path: 'test-results/layered-car-menu.png' })
})
