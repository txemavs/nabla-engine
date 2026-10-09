import { describe, expect, it } from 'vitest'
import { waitForArea } from '../../src/runtime/ground.js'
import { uploadSceneTextures } from '../../src/runtime/presentation-warmup.js'
import { Mesh, MeshStandardMaterial, BoxGeometry, Scene, Texture } from 'three'
import { StartCameraSequencer, resolveStartCameras } from '../../src/runtime/start-cameras.js'

function fakeWorld(cells: number) {
  let pending = cells
  let settled = 0
  return {
    updates: 0,
    update() {
      this.updates++
    },
    flushInstall() {
      if (pending > 0) {
        pending--
        settled++
      }
    },
    groundHeight: () => 0,
    status: '',
    get loadProgress() {
      return String(settled)
    },
    get cellStats() {
      return { pending }
    },
  }
}

describe('staged reveal', () => {
  it('waits until the planned cells and the map meshes around the start have installed', async () => {
    const world = fakeWorld(5)
    let meshes = 3
    const ready = await waitForArea(world, [0, 0, 0], {
      pending: () => meshes,
      flush: () => {
        if (meshes > 0) meshes--
      },
    })
    expect(ready).toBe(true)
    expect(world.cellStats.pending).toBe(0)
    expect(meshes).toBe(0)
  })

  it('gives up (false) when nothing arrives for the stall limit, without throwing', async () => {
    const world = { ...fakeWorld(0), cellStats: { pending: 2 }, flushInstall() {} }
    expect(await waitForArea(world, [0, 0, 0], { stallMs: 30, capMs: 1000 })).toBe(false)
  })

  it('uploads every texture in the scene, hidden objects included', async () => {
    const scene = new Scene()
    const texture = new Texture({ width: 1, height: 1 } as unknown as HTMLImageElement)
    const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: texture }))
    mesh.visible = false
    scene.add(mesh)
    const uploaded: Texture[] = []
    expect(await uploadSceneTextures({ initTexture: (t) => uploaded.push(t) }, scene)).toBe(1)
    expect(uploaded).toEqual([texture])
  })

  it('exposes the current start-camera step', () => {
    const sequence = new StartCameraSequencer(
      resolveStartCameras([
        { view: 'overhead', fromHeight: 600 },
        { view: 'driver', after: 0 },
      ]),
    )
    expect(sequence.step).toBe(0)
    expect(sequence.update({ now: 0, arrived: false, engineRunning: false }).view).toBeUndefined()
    expect(sequence.step).toBe(0)
    expect(sequence.update({ now: 1, arrived: true, engineRunning: false }).view).toBe('cockpit')
    expect(sequence.step).toBe(1)
  })
})
