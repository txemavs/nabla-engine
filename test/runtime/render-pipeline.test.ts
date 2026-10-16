import { expect, it, vi } from 'vitest'
import {
  DirectionalLight,
  Scene,
  PerspectiveCamera,
  Vector3,
  Object3D,
  WebGLRenderTarget,
} from 'three'
import { GameRenderPipeline, type GameRenderFrame } from '../../src/runtime/render-pipeline.js'
function fixture() {
  const events: string[] = [],
    overlay = new Object3D(),
    target = new WebGLRenderTarget(1, 1)
  let current = target
  const renderer = {
    autoClear: false,
    shadowMap: { needsUpdate: false },
    getRenderTarget: () => current,
    setRenderTarget: (value: typeof target) => {
      current = value
    },
    clearDepth: () => events.push('depth'),
    render: vi.fn(() => events.push('main')),
  }
  const frame = {
    renderer,
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    view: {
      portals: new Map(),
      renderMirrors: () => {
        expect(overlay.visible).toBe(false)
        events.push('mirrors')
      },
    },
    sky: {
      enabled: true,
      setViewAspect: () => {},
      render: () => events.push('sky'),
      renderClouds: () => events.push('clouds'),
    },
    clock: { mode: 'live' },
    origin: new Vector3(),
    eye: new Vector3(),
    shadows: { update: () => events.push('shadows') },
    monitors: {
      prepare: () => events.push('aperture'),
      finish: vi.fn(() => events.push('restore')),
    },
    time: 0,
    mirrorVehicle: 'car',
    shadowsEnabled: true,
    overlays: [overlay],
    cull: () => events.push('cull'),
    beforeMain: () => {
      expect(overlay.visible).toBe(true)
      events.push('layers')
    },
  } as unknown as GameRenderFrame
  return { frame, renderer, overlay, target, events, pipeline: new GameRenderPipeline() }
}
it('keeps the same colour pass at rest and throughout tunnel aiming', () => {
  const { frame, pipeline, target } = fixture()
  const begin = vi.spyOn(pipeline.depthOfField, 'begin').mockImplementation(() => {})
  const present = vi.spyOn(pipeline.depthOfField, 'present').mockImplementation(() => {})
  for (const progress of [0, 0.0001, 0.5, 1, 0]) {
    frame.tunnelFocus = progress
    pipeline.render(frame)
  }
  expect(begin).toHaveBeenCalledTimes(5)
  expect(present).toHaveBeenCalledTimes(5)
  frame.tunnelFocus = undefined
  pipeline.render(frame)
  expect(begin).toHaveBeenCalledTimes(5)
  pipeline.dispose()
  target.dispose()
})
it('renders auxiliary views before the main world, restores apertures before postprocessing', () => {
  const { frame, renderer, overlay, target, events, pipeline } = fixture()
  frame.depthOfField = true
  vi.spyOn(pipeline.depthOfField, 'begin').mockImplementation(() => events.push('dof-begin'))
  vi.spyOn(pipeline.depthOfField, 'present').mockImplementation(() => events.push('dof-present'))
  pipeline.render(frame)
  expect(events).toEqual([
    'cull',
    'mirrors',
    'cull',
    'layers',
    'dof-begin',
    'sky',
    'depth',
    'shadows',
    'aperture',
    'main',
    'clouds',
    'restore',
    'dof-present',
    'restore',
  ])
  expect(renderer.autoClear).toBe(false)
  expect(renderer.getRenderTarget()).toBe(target)
  expect(overlay.visible).toBe(true)
  pipeline.dispose()
  target.dispose()
})
it('restores host state when the main scene fails after switching render targets', () => {
  const { frame, renderer, overlay, target, pipeline } = fixture(),
    buffer = new WebGLRenderTarget(2, 2)
  frame.depthOfField = true
  vi.spyOn(pipeline.depthOfField, 'begin').mockImplementation(() =>
    renderer.setRenderTarget(buffer),
  )
  const present = vi.spyOn(pipeline.depthOfField, 'present')
  renderer.render.mockImplementation(() => {
    throw new Error('draw failed')
  })
  expect(() => pipeline.render(frame)).toThrow('draw failed')
  expect(frame.monitors.finish).toHaveBeenCalled()
  expect(present).not.toHaveBeenCalled()
  expect(renderer.getRenderTarget()).toBe(target)
  expect(renderer.autoClear).toBe(false)
  expect(overlay.visible).toBe(true)
  pipeline.dispose()
  target.dispose()
  buffer.dispose()
})
it('restores portal live flags and editor overlays after a failed mirror pass', () => {
  const { frame, renderer, overlay, target, pipeline } = fixture()
  const surface = { mesh: { material: { uniforms: { live: { value: 1 } } } } }
  frame.view.portals.set('gate', surface as never)
  frame.view.renderMirrors = () => {
    expect(surface.mesh.material.uniforms.live.value).toBe(0)
    throw new Error('mirror failed')
  }
  expect(() => pipeline.render(frame)).toThrow('mirror failed')
  expect(surface.mesh.material.uniforms.live.value).toBe(1)
  expect(overlay.visible).toBe(true)
  expect(renderer.autoClear).toBe(false)
  pipeline.dispose()
  target.dispose()
})

it('updates local shadows without repainting disabled sun shadow maps', () => {
  const { frame, renderer, pipeline, target } = fixture()
  const sun = new DirectionalLight()
  sun.castShadow = true
  sun.shadow.map = new WebGLRenderTarget(2, 2)
  frame.lights = [sun]
  frame.shadowsEnabled = false
  frame.localShadowUpdate = true
  Object.assign(renderer, { clear: vi.fn() })
  renderer.render.mockImplementation(() => {
    expect(renderer.shadowMap.needsUpdate).toBe(true)
    expect(sun.shadow.autoUpdate).toBe(false)
    expect(sun.shadow.needsUpdate).toBe(false)
    return 0
  })
  pipeline.render(frame)
  expect(sun.shadow.autoUpdate).toBe(true)
  sun.dispose()
  pipeline.dispose()
  target.dispose()
})
