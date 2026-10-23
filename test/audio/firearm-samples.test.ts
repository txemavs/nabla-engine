import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { FirearmSamples } from '../../src/audio/firearm-samples.js'
import { poseMagazineCapacity } from '../../src/render/entity/magazine-shape.js'
import { fireModeLabel } from '../../src/simulation/weapons/machine-pistol.js'
import type { WeaponPreset } from '../../src/catalog/weapons/library.js'

function fakeAudio(loaded = true) {
  const log: string[] = []
  return {
    log,
    weaponSample(url: string, _p?: readonly number[], o: { loop?: boolean } = {}) {
      if (!loaded) return null
      log.push(`sample ${url}${o.loop ? ' loop' : ''}`)
      return { stop: () => log.push(`stop ${url}`) }
    },
    weaponSound(sound: string) {
      log.push(`cue ${sound}`)
    },
    gunshot() {
      log.push('gunshot')
    },
  }
}
const preset = {
  audio: { shot: 's', autoLoop: 'l', autoTail: 't', cues: { 'magazine-in': 'm' } },
} as unknown as WeaponPreset

describe('firearm samples', () => {
  it('plays shot, loops automatic and ends with the tail', () => {
    const audio = fakeAudio()
    const samples = new FirearmSamples(audio)
    samples.shot(preset, [0, 0, 0], false, false)
    samples.shot(preset, [0, 0, 0], true, false)
    samples.shot(preset, [0, 0, 0], true, false)
    samples.release([0, 0, 0])
    samples.cue(preset, 'magazine-in')
    samples.cue(preset, 'magazine-out')
    expect(audio.log).toEqual([
      'sample s',
      'sample l loop',
      'stop l',
      'sample t',
      'sample m',
      'cue magazine-out',
    ])
  })
  it('falls back to the synthesised shot without recordings', () => {
    const audio = fakeAudio(false)
    new FirearmSamples(audio).shot(preset, [0, 0, 0], true, false)
    new FirearmSamples(audio).shot(undefined, [0, 0, 0], false, false)
    expect(audio.log).toEqual(['cue hammer', 'gunshot', 'cue hammer', 'gunshot'])
  })
})

describe('select fire and magazines', () => {
  it('labels native automatic as AUTO', () => {
    expect(fireModeLabel('burst30', true)).toBe('AUTO')
    expect(fireModeLabel('burst30')).toContain('RÁFAGA')
  })
  it('stretches a magazine only beyond its weapon capacity', () => {
    const magazine = new THREE.Group()
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.03))
    magazine.add(body)
    magazine.userData.nativeCapacity = 30
    poseMagazineCapacity(magazine, 30)
    expect(body.scale.y).toBe(1)
    poseMagazineCapacity(magazine, 40)
    expect(body.scale.y).toBe(1.75)
  })
})
