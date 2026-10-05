import { describe, expect, it } from 'vitest'
import { showTelemetry } from '../../game/telemetry.js'
import { controlProfile, controlSurfaces } from '../../src/runtime/control-profiles.js'
import type { GameFrame } from '../../src/runtime/browser.js'

function page() {
  const nodes = {
    'speed-display': { hidden: false, textContent: '0 km/h' },
    'gear-display': { hidden: false, textContent: 'N' },
  } as Record<string, { hidden: boolean; textContent: string }>
  return {
    nodes,
    root: { getElementById: (id: string) => nodes[id] ?? null } as unknown as Pick<
      Document,
      'getElementById'
    >,
  }
}

function frame(profile: string): GameFrame {
  return {
    speedKmh: 87.4,
    gear: 4,
    gearLabel: 'D4',
    location: null,
    controls: controlSurfaces(controlProfile(profile)),
  }
}

describe('game page speed/gear readouts', () => {
  it('road shows the speedometer and gear', () => {
    const { nodes, root } = page()
    showTelemetry(frame('road'), root)
    expect(nodes['speed-display']).toEqual({ hidden: false, textContent: '87 km/h' })
    expect(nodes['gear-display']).toEqual({ hidden: false, textContent: 'D4' })
  })

  it('carrier flight and on foot hide both', () => {
    for (const profile of ['flight', 'none']) {
      const { nodes, root } = page()
      showTelemetry(frame(profile), root)
      expect(nodes['speed-display']!.hidden, profile).toBe(true)
      expect(nodes['gear-display']!.hidden, profile).toBe(true)
      expect(nodes['speed-display']!.textContent).toBe('')
    }
  })

  it('switching back to a car restores them', () => {
    const { nodes, root } = page()
    showTelemetry(frame('flight'), root)
    showTelemetry(frame('road'), root)
    expect(nodes['speed-display']!.hidden).toBe(false)
  })
})
