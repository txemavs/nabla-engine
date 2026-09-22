import { expect, it } from 'vitest'
import { installCarrierPortals } from '../playground/carrier-portals.js'
import { createSampleScene } from './sample.js'
import { SceneEditor } from './editor.js'
import { createPortalPair } from './portal.js'
import { Simulation } from './simulation.js'

it('adds the measured carrier mouths once and preserves existing authored scene data', () => {
  const original = createSampleScene(),
    before = JSON.stringify(original)
  const installed = installCarrierPortals(original)
  expect(JSON.stringify(original)).toBe(before)
  expect(installed.entities.filter((e) => e.portal)).toHaveLength(1)
  expect(installCarrierPortals(installed)).toEqual(installed)
  for (const e of original.entities)
    expect(installed.entities.find((n) => n.id === e.id)).toEqual(e)
  const base = new Simulation(original),
    hosted = new Simulation(installed)
  expect(hosted.stats.bodies).toBe(base.stats.bodies)
  base.dispose()
  hosted.dispose()
})

it('duplicates and removes carrier mouths without leaving stale links or losing ramp metadata', () => {
  const doc = installCarrierPortals(createSampleScene())
  doc.entities.push(...createPortalPair('a', 'b'))
  const editor = new SceneEditor(doc)
  const stern = doc.entities.find((e) => e.portal?.clearsRamp)!
  editor.linkPortals(stern.id, 'a')
  editor.setPortalMode(stern.id, 'open')
  const copy = editor.duplicate(stern.parentId!)
  expect(
    editor.document.entities.find((e) => e.parentId === copy && e.portal?.clearsRamp)!.portal,
  ).toMatchObject({ clearsRamp: true, pairId: null, mode: 'closed' })
  editor.remove(stern.parentId!)
  expect(editor.document.entities.find((e) => e.id === 'a')!.portal).toEqual({
    pairId: null,
    mode: 'closed',
  })
  editor.undo()
  expect(editor.document.entities.find((e) => e.id === stern.id)!.portal).toMatchObject({
    clearsRamp: true,
    pairId: 'a',
    mode: 'open',
  })
})

it('retires saved bow portals, disconnects partners and installs glass only once', () => {
  const doc = createSampleScene()
  const host = doc.entities.find((e) => e.vehicle?.interior)!
  host.vehicle!.colliders.pop()
  const [bow, road] = createPortalPair('legacy-bow', 'road')
  bow.parentId = host.id
  bow.transform.position = [0, 0.55, -5.05]
  doc.entities.push(bow, road)
  const result = installCarrierPortals(doc)
  expect(result.entities.some((e) => e.id === bow.id)).toBe(false)
  expect(result.entities.find((e) => e.id === road.id)!.portal).toMatchObject({
    pairId: null,
    mode: 'closed',
  })
  expect(result.entities.filter((e) => e.parentId === host.id && e.portal)).toHaveLength(1)
  expect(result.entities.find((e) => e.id === host.id)!.vehicle!.colliders).toHaveLength(10)
  expect(installCarrierPortals(result)).toEqual(result)
})
