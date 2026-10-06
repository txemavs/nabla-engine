import { describe, expect, it } from 'vitest'
import { hostMirrorsFromSearch, parseHostMirrors } from '../../game/host-mirrors.js'
import { describeMirrors, formatMirrorDeg, mirrorBakeValues } from '../../game/mirror-controls.js'

const s3 = '/library/cars/a3/a3.cabrio.glb#/library/cars/a3/s3.steering.glb'
const truck =
  '/library/trucks/white-truck/assets/tractor.modern.glb#/library/trucks/white-truck/assets/steering.glb'

describe('host mirror defaults', () => {
  it('resolves preset ids to their mirror model', () => {
    expect(
      parseHostMirrors('{"car":{"left":{"yaw":-2}},"white-truck":{"right":{"tilt":"1"}}}'),
    ).toEqual({
      [s3]: { left: { yaw: -2, tilt: 0 } },
      [truck]: { right: { yaw: 0, tilt: 1 } },
    })
  })

  it('rejects typos instead of clamping them', () => {
    expect(() => parseHostMirrors('{"car":{"left":{"yaw":40}}}')).toThrow(/between -15 and 15/)
    expect(() => parseHostMirrors('{"nope":{}}')).toThrow(/Unknown vehicle preset/)
    expect(() => parseHostMirrors('[]')).toThrow(/JSON object/)
  })

  it('lets ?mirrors= win over the build value; empty means none', () => {
    const build = { [truck]: { left: { yaw: 1, tilt: 0 } } }
    expect(hostMirrorsFromSearch('', build)).toEqual(build)
    expect(hostMirrorsFromSearch('?mirrors=', build)).toEqual({})
    expect(
      hostMirrorsFromSearch(`?mirrors=${encodeURIComponent('{"a3":{"left":{"yaw":-1}}}')}`, build),
    ).toEqual({
      '/library/cars/a3/a3.cabrio.glb#/library/cars/a3/a3.steering.glb': {
        left: { yaw: -1, tilt: 0 },
      },
    })
  })

  it('shows degrees in Spanish and the values to bake', () => {
    expect(formatMirrorDeg(-2)).toBe('−2,0°')
    const adjustment = { left: { yaw: -2, tilt: 0.5 } }
    expect(describeMirrors(adjustment)).toBe(
      'izquierdo giro −2,0° · inclinación +0,5° | derecho giro 0,0° · inclinación 0,0°',
    )
    expect(mirrorBakeValues(adjustment)).toBe(
      '{"left":{"yaw":-2,"tilt":0.5},"right":{"yaw":0,"tilt":0}}',
    )
  })
})
