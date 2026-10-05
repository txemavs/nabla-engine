import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('location', { search: '' })
const { readBootConfig } = await import('../../game/boot.js')

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

  it('URL ?boot= wins for testers and ?probe=0 skips the probe', () => {
    const page = { NABLA_BOOT: { attract: true } }
    expect(readBootConfig('?boot=classic', page).attract).toBe(false)
    expect(readBootConfig('?boot=attract&probe=0', {})).toMatchObject({
      attract: true,
      probe: false,
    })
  })
})
