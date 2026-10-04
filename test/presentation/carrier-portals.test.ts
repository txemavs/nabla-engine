import { expect, it } from 'vitest'

import { createSampleScene } from '../../src/scene/sample.js'
import { SceneEditor } from '../../src/scene/history.js'
import { createPortalPair } from '../../src/entity/portal/portal.js'

it('duplicates and removes carrier mouths without leaving stale links or losing ramp metadata', () => {
  const doc = createSampleScene()
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
