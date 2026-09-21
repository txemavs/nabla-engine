import { describe, expect, it } from 'vitest'
import { Vector3 } from 'three'
import { SceneEditor } from './editor.js'
import { createA3, createCarrier } from './presets.js'
import { createEntity, parseScene, rotationDegrees, type SceneDocument } from './scene.js'
import { createCarrierPortals, createPortalPair, portalMapping, portalMatrix } from './portal.js'
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

describe('hosted portals and runtime addresses', () => {
  it('relinks reciprocal runtime addresses, closes previous partners and preserves authored state', () => {
    const doc = scene()
    doc.entities.push(...createPortalPair('c', 'd', [30, 1.455, 10], [40, 1.455, 10]))
    const before = JSON.stringify(doc),
      sim = new Simulation(doc)
    sim.configurePortal('a', 'c', 'open')
    expect(sim.portalState('a')).toMatchObject({ pairId: 'c', mode: 'open' })
    expect(sim.portalState('c')).toMatchObject({ pairId: 'a', mode: 'open' })
    expect(sim.portalState('b')).toMatchObject({ pairId: null, mode: 'closed' })
    expect(sim.portalState('d')).toMatchObject({ pairId: null, mode: 'closed' })
    expect(JSON.stringify(doc)).toBe(before)
    sim.configurePortal('a', 'c', 'closed')
    drive(sim)
    expect(sim.portalEvent).toBeNull()
    expect(sim.player.position[2]).toBeGreaterThan(0)
    sim.dispose()
  })
  it('refuses closure through an actor without partially changing the link', () => {
    const doc = scene()
    doc.entities.find((e) => e.kind === 'spawn')!.transform.position = [0, 0.02, 0.1]
    const sim = new Simulation(doc)
    expect(() => sim.configurePortal('a', 'b', 'closed')).toThrow(/ocupado/)
    expect(sim.portalState('a').mode).toBe('open')
    expect(sim.portalState('b').mode).toBe('open')
    sim.dispose()
  })
})

it('backs the A3 from the carrier through its mounted stern gate without changing driver', () => {
  const doc = scene()
  doc.entities.find((e) => e.kind === 'spawn')!.transform.position = [1.7, 0.35, 2.5]
  doc.entities.push(
    createCarrier('ship', [0, 1.2, 0]),
    createA3('car', [0, 0.85, 2.5]),
    ...createCarrierPortals('ship', 'bow', 'stern'),
  )
  // Keep both road gates well clear of the ship.
  doc.entities.find((e) => e.id === 'a')!.transform.position = [20, 1.455, 0]
  doc.entities.find((e) => e.id === 'b')!.transform.position = [40, 1.455, 0]
  const sim = new Simulation(doc)
  for (let i = 0; i < 120; i++) sim.step(1 / 60)
  sim.configurePortal('stern', 'a', 'open')
  expect(sim.portalState('stern').clearsRamp).toBe(true)
  expect(sim.vehicleInfo('ship').rampClosed).toBe(false)
  expect(sim.interact()).toContain('Conduciendo')
  expect(sim.player.vehicleId).toBe('car')
  for (let i = 0; i < 240 && !sim.portalEvent; i++) {
    sim.setInput({ ...idleInput(), forward: -1 })
    sim.step(1 / 60)
  }
  expect(sim.portalEvent).toMatchObject({ sourceId: 'stern', destinationId: 'a', blocked: false })
  expect(sim.player.vehicleId).toBe('car')
  expect(sim.player.position[0]).toBeGreaterThan(19)
  sim.dispose()
})

it('keeps hosted mouths rigidly attached during flight, including pitch and roll', () => {
  const doc = scene()
  doc.entities.find((e) => e.kind === 'spawn')!.transform.position = [1.6, 0.35, -2.8]
  doc.entities.find((e) => e.id === 'a')!.transform.position = [20, 1.455, 0]
  doc.entities.find((e) => e.id === 'b')!.transform.position = [40, 1.455, 0]
  doc.entities.push(
    createCarrier('ship', [0, 1.2, 0]),
    ...createCarrierPortals('ship', 'bow', 'stern'),
  )
  const sim = new Simulation(doc)
  for (let i = 0; i < 120; i++) sim.step(1 / 60)
  sim.interact()
  expect(sim.player.vehicleId).toBe('ship')
  sim.toggleFlight()
  sim.configurePortal('stern', 'a', 'open')
  for (let i = 0; i < 120; i++) {
    sim.setInput({ ...idleInput(), lift: 1, forward: 0.4, right: 0.25, turn: 0.2 })
    sim.step(1 / 60)
  }
  const host = sim.entityTransform('ship'),
    mouth = sim.entityTransform('stern')
  const local = new Vector3(...mouth.position).applyMatrix4(portalMatrix(host).invert())
  expect(local.distanceTo(new Vector3(0, 0.55, 5.05))).toBeLessThan(1e-8)
  expect(host.position[1]).toBeGreaterThan(3)
  expect(Math.abs(host.rotation[0]) + Math.abs(host.rotation[2])).toBeGreaterThan(0.01)
  expect(sim.vehicleInfo('ship').rampClosed).toBe(false)
  sim.dispose()
})

it('transfers a moving prop through the stern gate while its carrier is moving', () => {
  const doc = scene()
  doc.entities.find((e) => e.kind === 'spawn')!.transform.position = [1.6, 0.35, -2.8]
  doc.entities.find((e) => e.id === 'a')!.transform.position = [20, 1.455, 0]
  doc.entities.find((e) => e.id === 'b')!.transform.position = [40, 1.455, 0]
  const prop = createEntity('cargo', 'box', [0, 0.7, 3.5])
  prop.size = [0.4, 0.4, 0.4]
  prop.motion = 'dynamic'
  prop.mass = 1
  doc.entities.push(
    createCarrier('ship', [0, 1.2, 0]),
    prop,
    ...createCarrierPortals('ship', 'bow', 'stern'),
  )
  const sim = new Simulation(doc)
  for (let i = 0; i < 120; i++) sim.step(1 / 60)
  sim.configurePortal('stern', 'a', 'open')
  sim.interact()
  expect(sim.player.vehicleId).toBe('ship')
  sim.setInput({ ...idleInput(), forward: 1 })
  for (let i = 0; i < 30; i++) sim.step(1 / 60)
  const cargo = sim.entityTransform('cargo').position
  expect(sim.shoot([cargo[0], cargo[1], cargo[2] - 1], [0, 0, 1])?.entityId).toBe('cargo')
  for (let i = 0; i < 120 && sim.portalEvent?.actorId !== 'cargo'; i++) sim.step(1 / 60)
  expect(sim.portalEvent).toMatchObject({ actorId: 'cargo', destinationId: 'a', blocked: false })
  expect(sim.entityTransform('ship').position[2]).toBeLessThan(-0.1)
  expect(sim.entityTransform('cargo').position[0]).toBeGreaterThan(19)
  expect(sim.player.vehicleId).toBe('ship')
  sim.dispose()
})

it('lets the hovering monitor use the bow gate beside the existing helm', () => {
  const doc = scene()
  doc.entities.find((e) => e.kind === 'spawn')!.transform.position = [1.9, 0.35, -2.6]
  doc.entities.find((e) => e.id === 'a')!.transform.position = [20, 1.455, 0]
  doc.entities.find((e) => e.id === 'b')!.transform.position = [40, 1.455, 0]
  doc.entities.push(
    createCarrier('ship', [0, 1.2, 0]),
    ...createCarrierPortals('ship', 'bow', 'stern'),
  )
  const sim = new Simulation(doc, { playerMode: 'hover' })
  for (let i = 0; i < 120; i++) sim.step(1 / 60)
  sim.configurePortal('bow', 'a', 'open')
  for (let i = 0; i < 120 && !sim.portalEvent; i++) {
    sim.setInput({ ...idleInput(), forward: 1 })
    sim.step(1 / 60)
  }
  expect(sim.portalEvent).toMatchObject({
    actorId: 'player',
    sourceId: 'bow',
    destinationId: 'a',
    blocked: false,
  })
  expect(sim.player.position[0]).toBeGreaterThan(17)
  sim.dispose()
})

it('leaves the helm at orbital height, walks to Earth and returns to the same carrier interior', () => {
  const doc = scene()
  doc.geography = { latitude: 40.4166, longitude: -3.70384, altitude: 0, imagery: 'offline' }
  doc.entities.find((e) => e.kind === 'spawn')!.transform.position = [1.85, 90000.35, -2.8]
  doc.entities.find((e) => e.id === 'a')!.transform.position = [20, 1.455, 0]
  doc.entities.find((e) => e.id === 'b')!.transform.position = [40, 1.455, 0]
  doc.entities.push(
    createCarrier('ship', [0, 90000, 0]),
    ...createCarrierPortals('ship', 'bow', 'stern'),
  )
  const sim = new Simulation(doc, { playerMode: 'hover' })
  expect(sim.interact()).toContain('Conduciendo')
  sim.toggleFlight()
  sim.setInput({ ...idleInput(), lift: 1, sprint: true })
  for (let i = 0; i < 180; i++) sim.step(1 / 60)
  sim.setInput(idleInput())
  for (let i = 0; i < 900; i++) sim.step(1 / 60)
  const orbitHeight = sim.entityTransform('ship').position[1]
  expect(orbitHeight).toBeGreaterThan(100000)
  expect(sim.interact()).toContain('Dentro de la nave')
  expect(sim.player.vehicleId).toBeNull()
  expect(sim.player.interiorId).toBe('ship')
  sim.configurePortal('bow', 'a', 'open')
  for (let i = 0; i < 240 && !sim.portalEvent; i++) {
    sim.setInput({ ...idleInput(), forward: 1, yaw: sim.player.yaw })
    sim.step(1 / 60)
  }
  expect(sim.portalEvent).toMatchObject({ actorId: 'player', destinationId: 'a', blocked: false })
  expect(sim.player.interiorId).toBeNull()
  expect(sim.player.position[1]).toBeLessThan(3)
  sim.setInput({ ...idleInput(), forward: 1, yaw: sim.player.yaw })
  for (let i = 0; i < 25; i++) sim.step(1 / 60)
  for (let i = 0; i < 180 && sim.portalEvent?.destinationId !== 'bow'; i++) {
    sim.setInput({ ...idleInput(), forward: -1, yaw: sim.player.yaw })
    sim.step(1 / 60)
  }
  expect(sim.portalEvent).toMatchObject({ destinationId: 'bow', blocked: false })
  expect(sim.player.interiorId).toBe('ship')
  expect(sim.player.position[1]).toBeGreaterThan(orbitHeight - 2)
  expect(sim.vehicleInfo('ship').flightMode).toBe(true)
  expect(sim.entityTransform('ship').position[1]).toBeCloseTo(orbitHeight, 1)
  sim.dispose()
})

it('checks a distant portal exit against suspended map colliders', () => {
  const doc = scene()
  doc.entities.find((e) => e.id === 'b')!.transform.position[0] = 1000
  const block = createEntity('remote-block', 'box', [1000, 1, -1])
  block.size = [5, 2, 1]
  block.source = { provider: 'openstreetmap', id: 'way/123', retrievedAt: '2026-09-21', tags: {} }
  doc.entities.push(block)
  const sim = new Simulation(doc)
  sim.setCollisionDistance(200)
  expect(sim.collisionStats.active).toBe(0)
  drive(sim)
  expect(sim.portalEvent?.blocked).toBe(true)
  expect(sim.player.position[0]).toBeLessThan(1)
  sim.dispose()
})
