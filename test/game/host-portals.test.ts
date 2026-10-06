import { describe, expect, it } from 'vitest'
import {
  hostPortalsFromSearch,
  installHostPortals,
  parseHostPortals,
  type HostPortal,
  type HostPortalRuntime,
} from '../../game/host-portals.js'
import { configToUrl, parseGameConfig } from '../../game/config.js'
import type { Entity, Vec3Tuple } from '../../src/entity/schema.js'

const irun = { latitude: 43.3372, longitude: -1.7523, altitude: 50 }
const pair: HostPortal[] = [
  { name: 'Plaza', lat: 43.3381, lon: -1.7667, heading: 60, to: 'Puerto' },
  { name: 'Puerto', lat: 43.3392, lon: -1.7631, heading: 240 },
]

function fakeRuntime() {
  const placed: {
    id: string
    ids: string[]
    entities: Entity[]
    position: Vec3Tuple
    yaw?: number
    name?: string
  }[] = []
  const links: [string, string | null, string][] = []
  const runtime: HostPortalRuntime = {
    async placeEntities(entities, position, yaw, _timeout, name) {
      const id = `placed-${placed.length + 1}`
      placed.push({ id, ids: entities.map((e) => `${id}-${e.id}`), entities, position, yaw, name })
      return id
    },
    get placedObjects() {
      return placed
    },
    configurePortal(id, destinationId, mode) {
      links.push([id, destinationId, mode])
      return id
    },
  }
  return { runtime, placed, links }
}

describe('parseHostPortals', () => {
  it('reads names, coordinates, heading, alt, links and modes', () => {
    expect(
      parseHostPortals(
        '[{"name":" Plaza ","lat":"43.3","lon":-1.7,"to":"Puerto","mode":"window"},{"name":"Puerto","lat":43.31,"lon":-1.71,"heading":90,"alt":12}]',
      ),
    ).toEqual<HostPortal[]>([
      { name: 'Plaza', lat: 43.3, lon: -1.7, heading: 0, to: 'Puerto', mode: 'window' },
      { name: 'Puerto', lat: 43.31, lon: -1.71, heading: 90, alt: 12 },
    ])
  })

  it('rejects bad JSON, missing names, bad coordinates, modes and links', () => {
    expect(() => parseHostPortals('nope')).toThrow(/JSON array/)
    expect(() => parseHostPortals('{}')).toThrow(/JSON array/)
    expect(() => parseHostPortals('[{"lat":1,"lon":1}]')).toThrow(/needs a name/)
    expect(() => parseHostPortals('[{"name":"a","lat":95,"lon":1}]')).toThrow(/out of range/)
    expect(() => parseHostPortals('[{"name":"a","lat":1,"lon":1,"mode":"closed"}]')).toThrow(
      /open or window/,
    )
    expect(() =>
      parseHostPortals('[{"name":"a","lat":1,"lon":1},{"name":"a","lat":1,"lon":1}]'),
    ).toThrow(/repeated/)
    expect(() => parseHostPortals('[{"name":"a","lat":1,"lon":1,"to":"b"}]')).toThrow(/unknown/)
    expect(() =>
      parseHostPortals(
        '[{"name":"a","lat":1,"lon":1,"to":"b"},{"name":"b","lat":1,"lon":1,"to":"a"}]',
      ),
    ).toThrow(/linked twice/)
  })

  it('takes ?portals= over the fallback and keeps the config round trip', () => {
    expect(hostPortalsFromSearch('', pair)).toEqual(pair)
    expect(hostPortalsFromSearch('?portals=', pair)).toEqual([])
    const search = `?portals=${encodeURIComponent(JSON.stringify(pair))}`
    expect(hostPortalsFromSearch(search)).toEqual(pair)
    const config = parseGameConfig(search)
    expect(config.portals).toEqual(pair)
    expect(parseGameConfig(new URL(configToUrl(config), 'http://x').search).portals).toEqual(pair)
    expect(parseGameConfig('').portals).toBeUndefined()
  })
})

describe('installHostPortals', () => {
  it('places one closed Stargate per entry, named, then links the `to` pairs', async () => {
    const { runtime, placed, links } = fakeRuntime()
    const ids = await installHostPortals(runtime, irun, pair)
    expect(placed.map((p) => p.name)).toEqual(['Plaza', 'Puerto'])
    for (const p of placed) {
      expect(p.entities).toHaveLength(1)
      expect(p.entities[0]!.portal).toEqual({ pairId: null, mode: 'closed' })
      expect(p.entities[0]!.name).toBe(p.name)
    }
    // Heading 60 vs 240: the two mouths face opposite ways.
    expect(Math.abs(Math.abs(placed[0]!.yaw! - placed[1]!.yaw!) - Math.PI)).toBeLessThan(1e-9)
    // ~1.2 km west and ~100 m north of the origin.
    expect(placed[0]!.position[0]).toBeLessThan(-1000)
    expect(ids.get('Plaza')).toBe('placed-1-host-portal-0')
    expect(links).toEqual([['placed-1-host-portal-0', 'placed-2-host-portal-1', 'open']])
  })
})
