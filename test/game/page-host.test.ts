import { afterEach, describe, expect, it } from 'vitest'
import { pageAddress, pageSearch, setPageQuery } from '../../game/page-query.js'
import { setTerrainHost, terrainHost } from '../../game/terrain-host.js'
import { defaultWorldSource, hasTerrain } from '../../game/world-source.js'

const clear = () => {
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('nabla.pageQuery')]
  delete (globalThis as Record<symbol, unknown>)[Symbol.for('nabla.terrainHost')]
}
afterEach(clear)

describe('page hosts', () => {
  it('reads the host query and address, else the page', () => {
    expect(pageSearch()).toBe(globalThis.location?.search ?? '')
    expect(pageAddress('?a=1')).toBe('?a=1')
    setPageQuery({ search: () => '?example=flat', address: () => '/' })
    expect(pageSearch()).toBe('?example=flat')
    expect(pageAddress('?a=1')).toBe('/')
  })
  it('keeps one terrain host for every module copy', () => {
    expect(terrainHost()).toEqual({})
    const host = { afterRuntime: () => {} }
    setTerrainHost(host)
    expect(terrainHost()).toBe(host)
  })
  it('defaults the world by page', () => {
    expect(defaultWorldSource('/test.html')).toEqual({ kind: 'flat' })
    expect(defaultWorldSource('/xr.html')).toEqual({ kind: 'flat' })
    expect(defaultWorldSource('/')).toEqual({ kind: 'terrain' })
    expect(hasTerrain({ kind: 'model' })).toBe(false)
  })
})
