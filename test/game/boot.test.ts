import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('location', { search: '' })
const { bootHiddenLayers, readBootConfig } = await import('../../game/boot.js')

describe('standalone boot config', () => {
  it('defaults to the classic splash without attract', () => {
    expect(readBootConfig('', {})).toMatchObject({ splash: {} })
    expect(readBootConfig('', {}).attract).toBeUndefined()
  })

  it('lets a host page enable attract and its skin; attract defaults the corner layout', () => {
    const page = {
      NABLA_BOOT: { attract: true, splash: { title: 'EUSKADI ONLINE', messages: ['Kaixo'] } },
    }
    const boot = readBootConfig('', page)
    expect(boot.attract).toBe(true)
    expect(boot.splash).toMatchObject({ title: 'EUSKADI ONLINE', layout: 'corner' })
  })

  it('keeps the mark-only layout under attract and maps cityLabels to the places layer', () => {
    const page = {
      NABLA_BOOT: {
        attract: true,
        cityLabels: false,
        splash: { layout: 'mark' as const, messages: [] },
      },
    }
    const boot = readBootConfig('', page)
    expect(boot.splash).toMatchObject({ layout: 'mark', messages: [] })
    expect(bootHiddenLayers(boot)).toEqual(['places'])
    expect(bootHiddenLayers(readBootConfig('', {}))).toEqual([])
  })

  it('preAttract is black + mark only, quiet, with attract on', () => {
    const boot = readBootConfig('', { NABLA_BOOT: { preAttract: true } })
    expect(boot.attract).toBe(true)
    expect(boot.splash).toEqual({ layout: 'mark', messages: [], status: false })
    // A tester can still compare the classic boot.
    expect(readBootConfig('?boot=classic', { NABLA_BOOT: { preAttract: true } }).attract).toBe(
      false,
    )
  })

  it('URL ?boot= wins for testers and ?probe=0 skips the probe', () => {
    const page = { NABLA_BOOT: { attract: true } }
    expect(readBootConfig('?boot=classic', page).attract).toBe(false)
    expect(readBootConfig('?boot=attract&probe=0', {})).toMatchObject({
      attract: true,
      probe: false,
    })
  })

  it('reads flipCinematic from NABLA_BOOT and URL', () => {
    expect(readBootConfig('', { NABLA_BOOT: { flipCinematic: false } }).flipCinematic).toBe(false)
    expect(readBootConfig('?flipCinematic=0', {}).flipCinematic).toBe(false)
    expect(readBootConfig('?flipcam=1', {}).flipCinematic).toBe(true)
  })

  it('reads recoverToRoad from NABLA_BOOT and URL', () => {
    expect(readBootConfig('', { NABLA_BOOT: { recoverToRoad: false } }).recoverToRoad).toBe(false)
    expect(readBootConfig('?recoverToRoad=0', {}).recoverToRoad).toBe(false)
    expect(
      readBootConfig('?roadReset=1', { NABLA_BOOT: { recoverToRoad: false } }).recoverToRoad,
    ).toBe(true)
  })
})
