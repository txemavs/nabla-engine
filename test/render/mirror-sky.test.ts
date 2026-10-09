import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { renderSceneWithSky } from '../../src/render/entity/car-mirrors.js'

describe('mirror sky composite', () => {
  it('paints the sky into the current target before the reflected scene, then restores render', () => {
    const order: string[] = []
    const renderer = {
      autoClear: true,
      render(scene: THREE.Scene, _camera?: THREE.Camera) {
        order.push(`scene:${scene.name}:clear=${renderer.autoClear}`)
      },
    }
    const sky = new THREE.Scene()
    sky.name = 'sky'
    const world = new THREE.Scene()
    world.name = 'world'
    const camera = new THREE.PerspectiveCamera()
    renderSceneWithSky(
      renderer as unknown as { render: THREE.WebGLRenderer['render']; autoClear: boolean },
      (cam) => {
        expect(cam).toBe(camera)
        order.push('sky')
        renderer.render(sky)
      },
      () => renderer.render(world, camera),
    )
    expect(order).toEqual(['sky', 'scene:sky:clear=true', 'scene:world:clear=false'])
    expect(renderer.autoClear).toBe(true)
    renderer.render(world)
    expect(order.at(-1)).toBe('scene:world:clear=true')
  })

  it('draws the scene alone when there is no sky pass', () => {
    let calls = 0
    const renderer = {
      autoClear: true,
      render() {
        calls += 1
      },
    }
    renderSceneWithSky(
      renderer as unknown as { render: THREE.WebGLRenderer['render']; autoClear: boolean },
      undefined,
      () => renderer.render(),
    )
    expect(calls).toBe(1)
  })
})
