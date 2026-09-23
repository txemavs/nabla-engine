import { recoverUnplacedDefaults } from './ground-placement.js'
import { createEntity, SceneGraph, type SceneDocument } from '../../src/scene.js'
import { createA3, createCarrier } from '../../src/presets.js'
import type { GeoPoint } from '../../src/geography.js'
/** User-owned content survives removal of generated context, with its world pose intact. */
export function planetaryScene(document: SceneDocument): SceneDocument {
  document = recoverUnplacedDefaults(document)
  if (
    !document.geography ||
    (!document.geography.planetary &&
      !document.entities.some((e) => e.id.startsWith('world-terrain')))
  )
    return document
  const generated = new Set(
    document.entities
      .filter(
        (e) =>
          !e.mapEditable &&
          (/^world-(terrain|buildings|roads|trees|landcover|water|railways|places)(?:-|$)/.test(
            e.id,
          ) ||
            !!e.source),
      )
      .map((e) => e.id),
  )
  // Authored road definitions still need their explicit terrain reference. They are
  // authored content, not part of the streaming cache, and must never be discarded.
  for (const e of document.entities)
    if (!generated.has(e.id) && e.road) generated.delete(e.road.terrainId)
  if (!generated.size && document.geography.planetary && document.geography.imagery === 'offline')
    return document
  const graph = SceneGraph.fromValidated(document)
  const entities = document.entities
    .filter((e) => !generated.has(e.id))
    .map((e) => {
      if (!e.parentId || !generated.has(e.parentId)) return e
      return { ...e, parentId: null, transform: graph.worldTransform(e.id) }
    })
  return {
    ...document,
    geography: { ...document.geography, imagery: 'offline', planetary: true },
    entities,
  }
}
export function createPlanetScene(origin: GeoPoint, name: string): SceneDocument {
  return {
    version: 1,
    name,
    sky: { mode: 'fixed', at: '2026-09-21T12:00:00.000Z' },
    geography: { ...origin, imagery: 'offline', planetary: true },
    cursor: [0, 0, 0],
    cursorOnGround: true,
    entities: [
      createEntity('spawn', 'spawn', [-2, 1, 0]),
      createA3('car-a', [0, 1, 0]),
      createCarrier('carrier', [20, 2, 0]),
    ].map((e) => ({
      ...e,
      groundOffset: e.kind === 'spawn' ? 0.2 : e.vehicle?.flight ? 1.2 : 0.62,
    })),
  }
}
