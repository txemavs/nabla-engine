import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { SceneEditor } from './editor.js'
import { createA3 } from './presets.js'
import { createEntity, parseScene, rotationDegrees, type SceneDocument } from './scene.js'
import { createPortalPair, portalMapping } from './portal.js'
import { idleInput, Simulation } from './simulation.js'

function scene(car = false): SceneDocument {
  return parseScene({
    version: 1,
    name: 'Portal test',
    entities: [
      { ...createEntity('floor', 'box', [0, -0.3, 0]), size: [100, 0.6, 100] },
      createEntity('spawn', 'spawn', car ? [1.4, 0.03, 5] : [0, 0.03, 5]),
      ...createPortalPair('a', 'b', [0, 1.455, 0], [20, 1.455, 0]),
      ...(car ? [createA3('car', [0, 0.7, 5])] : []),
    ],
  })
}
function drive(sim: Simulation, ticks = 240) {
  for (let i = 0; i < ticks; i++) {
    sim.setInput({ ...idleInput(), forward: 1, yaw: sim.player.yaw })
    sim.step(1 / 60)
  }
}

describe('portal contract and journeys', () => {
  it('maps rigid poses reversibly, including pitch and roll in the math', () => {
    const a = {
      position: [1, 2, 3] as [number, number, number],
      rotation: rotationDegrees(20, 35, 10),
    }
    const b = {
      position: [50, -2, 7] as [number, number, number],
      rotation: rotationDegrees(-15, 150, 25),
    }
    const p = new Vector3(4, 8, -3)
    expect(
      p.clone().applyMatrix4(portalMapping(a, b)).applyMatrix4(portalMapping(b, a)).distanceTo(p),
    ).toBeLessThan(1e-10)
  })
  it('validates links atomically and closes the surviving mouth on removal', () => {
    const editor = new SceneEditor(scene())
    const before = editor.serialize()
    expect(() => editor.update('a', { portal: { pairId: 'missing', mode: 'open' } })).toThrow()
    expect(editor.serialize()).toBe(before)
    editor.setPortalMode('a', 'window')
    expect(
      editor.document.entities.filter((e) => e.portal).every((e) => e.portal!.mode === 'window'),
    ).toBe(true)
    const copy = editor.duplicate('a')
    expect(editor.document.entities.find((e) => e.id === copy)!.portal).toEqual({
      pairId: null,
      mode: 'closed',
    })
    editor.remove('a')
    expect(editor.document.entities.find((e) => e.id === 'b')!.portal).toEqual({
      pairId: null,
      mode: 'closed',
    })
    editor.undo()
    expect(editor.document.entities.find((e) => e.id === 'a')).toBeDefined()
  })
  it('walks through once without changing authored state or duplicating bodies', () => {
    const doc = scene(),
      before = JSON.stringify(doc),
      sim = new Simulation(doc)
    const count = sim.stats.bodies
    drive(sim)
    expect(sim.portalEvent?.blocked).toBe(false)
    expect(sim.player.position[0]).toBeCloseTo(20, 1)
    expect(sim.player.position[2]).toBeLessThan(-1)
    expect(sim.stats.bodies).toBe(count)
    expect(JSON.stringify(doc)).toBe(before)
    sim.dispose()
  })
  it('transfers the A3 without unseating the driver or dropping speed', () => {
    const sim = new Simulation(scene(true))
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    expect(sim.interact()).toContain('Conduciendo')
    drive(sim, 240)
    expect(sim.portalEvent?.blocked).toBe(false)
    expect(sim.player.vehicleId).toBe('car')
    expect(sim.player.position[0]).toBeCloseTo(20, 1)
    expect(sim.player.speed).toBeGreaterThan(2)
    sim.dispose()
  })
  it('rotates the exit direction and returns through the same pair', () => {
    const doc = scene()
    doc.entities.find((e) => e.id === 'b')!.transform.rotation = rotationDegrees(0, 90, 0)
    const sim = new Simulation(doc)
    drive(sim, 180)
    expect(sim.portalEvent?.blocked).toBe(false)
    expect(sim.player.position[0]).toBeGreaterThan(21)
    expect(Math.abs(sim.player.position[2])).toBeLessThan(0.1)
    expect(sim.player.yaw).toBeCloseTo(-Math.PI / 2)
    for (let i = 0; i < 180; i++) {
      sim.setInput({ ...idleInput(), forward: -1, yaw: sim.player.yaw })
      sim.step(1 / 60)
    }
    expect(sim.portalEvent?.destinationId).toBe('a')
    expect(sim.player.position[0]).toBeCloseTo(0, 1)
    expect(sim.player.position[2]).toBeGreaterThan(1)
    sim.dispose()
  })
  it('rejects a car that is wider than the aperture', () => {
    const doc = scene(true)
    for (const e of doc.entities) if (e.portal) e.size[0] = 1.3
    const sim = new Simulation(doc)
    for (let i = 0; i < 120; i++) sim.step(1 / 60)
    sim.interact()
    drive(sim)
    expect(sim.player.position[0]).toBeLessThan(2)
    expect(sim.player.vehicleId).toBe('car')
    expect(sim.portalEvent?.blocked ?? true).toBe(true)
    sim.dispose()
  })
  it('relinks both ends and disconnects their previous partners in one transaction', () => {
    const doc = scene()
    doc.entities.push(...createPortalPair('c', 'd', [30, 1.455, 10], [40, 1.455, 10]))
    const editor = new SceneEditor(doc)
    editor.linkPortals('a', 'c')
    const portals = new Map(editor.document.entities.map((e) => [e.id, e.portal]))
    expect(portals.get('a')).toEqual({ pairId: 'c', mode: 'closed' })
    expect(portals.get('c')).toEqual({ pairId: 'a', mode: 'closed' })
    expect(portals.get('b')).toEqual({ pairId: null, mode: 'closed' })
    expect(portals.get('d')).toEqual({ pairId: null, mode: 'closed' })
    editor.undo()
    expect(editor.document.entities.find((e) => e.id === 'a')!.portal!.pairId).toBe('b')
  })
  it('does not keep the source floor contact when emerging above the destination floor', () => {
    const doc = scene()
    doc.entities.find((e) => e.id === 'b')!.transform.position[1] += 8
    const sim = new Simulation(doc)
    for (let i = 0; i < 240 && !sim.portalEvent; i++) drive(sim, 1)
    expect(sim.portalEvent?.blocked).toBe(false)
    expect(sim.player.position[1]).toBeGreaterThan(8)
    expect(sim.player.grounded).toBe(false)
    sim.dispose()
  })
  it('blocks windows and occupied exits', () => {
    const editor = new SceneEditor(scene())
    editor.setPortalMode('a', 'window')
    const window = new Simulation(editor.document)
    drive(window)
    expect(window.player.position[0]).toBeLessThan(1)
    expect(window.player.position[2]).toBeGreaterThan(0)
    expect(window.portalEvent).toBeNull()
    window.dispose()
    const doc = scene()
    doc.entities.push({ ...createEntity('block', 'box', [20, 1, -1]), size: [5, 2, 1] })
    const blocked = new Simulation(doc)
    drive(blocked)
    expect(blocked.portalEvent?.blocked).toBe(true)
    expect(blocked.player.position[0]).toBeLessThan(1)
    blocked.dispose()
  })
})
