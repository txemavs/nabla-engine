import { describe, it, expect } from 'vitest'
import {
  specToDefinition,
  specToTune,
  chassisInertia,
  definitionNeedsRemount,
  emptySnapshot,
  emptyDebugFrame,
  DEFAULT_VEHICLE_SPEC,
  A3_DEFINITION,
  A3_TUNE,
} from './vehicleDef.js'

describe('vehicleDef', () => {
  describe('specToDefinition', () => {
    it('creates definition from default spec', () => {
      const def = specToDefinition(DEFAULT_VEHICLE_SPEC)

      expect(def.mass).toBe(1400)
      expect(def.size.x).toBeCloseTo(1.8)
      expect(def.size.y).toBeCloseTo(1.4)
      expect(def.size.z).toBeCloseTo(4.2)
      expect(def.wheelbase).toBeCloseTo(2.6)
    })

    it('creates definition from empty spec (uses defaults)', () => {
      const def = specToDefinition({})

      expect(def.mass).toBe(1400)
      expect(def.wheelbase).toBeCloseTo(2.6)
    })

    it('creates definition with custom mass', () => {
      const def = specToDefinition({ mass: 2000 })

      expect(def.mass).toBe(2000)
    })
  })

  describe('specToTune', () => {
    it('creates tune from default spec', () => {
      const tune = specToTune(DEFAULT_VEHICLE_SPEC)

      expect(tune.maxForce).toBe(3200)
      expect(tune.maxSteer).toBeCloseTo(0.38)
      expect(tune.brake).toBe(80)
    })

    it('creates tune with custom values', () => {
      const tune = specToTune({ maxForce: 5000 })

      expect(tune.maxForce).toBe(5000)
    })
  })

  describe('chassisInertia', () => {
    it('computes inertia from definition', () => {
      const inertia = chassisInertia(A3_DEFINITION)

      expect(inertia.x).toBeGreaterThan(0)
      expect(inertia.y).toBeGreaterThan(0)
      expect(inertia.z).toBeGreaterThan(0)
    })

    it('inertia increases with mass', () => {
      const def1 = specToDefinition({ mass: 1000 })
      const def2 = specToDefinition({ mass: 2000 })

      const i1 = chassisInertia(def1)
      const i2 = chassisInertia(def2)

      expect(i2.x).toBeGreaterThan(i1.x)
      expect(i2.y).toBeGreaterThan(i1.y)
      expect(i2.z).toBeGreaterThan(i1.z)
    })
  })

  describe('definitionNeedsRemount', () => {
    it('returns false for identical definitions', () => {
      expect(definitionNeedsRemount(A3_DEFINITION, A3_DEFINITION)).toBe(false)
    })

    it('returns true when mass changes', () => {
      const mod = { ...A3_DEFINITION, mass: A3_DEFINITION.mass + 100 }
      expect(definitionNeedsRemount(A3_DEFINITION, mod)).toBe(true)
    })

    it('returns true when size changes', () => {
      const mod = { ...A3_DEFINITION, size: { ...A3_DEFINITION.size, x: 2.0 } }
      expect(definitionNeedsRemount(A3_DEFINITION, mod)).toBe(true)
    })
  })

  describe('emptySnapshot', () => {
    it('returns valid empty snapshot', () => {
      const snap = emptySnapshot()

      expect(snap.body.x).toBe(0)
      expect(snap.body.qw).toBe(1)
      expect(snap.gear).toBe('idle')
      expect(snap.wheelsInContact).toBe(0)
      expect(snap.suspension).toEqual([0, 0, 0, 0])
    })
  })

  describe('emptyDebugFrame', () => {
    it('returns valid empty debug frame', () => {
      const frame = emptyDebugFrame()

      expect(frame.com.x).toBe(0)
      expect(frame.wheels.length).toBe(4)
      expect(frame.wheels[0].id).toBe('FL')
      expect(frame.wheels[1].id).toBe('FR')
      expect(frame.wheels[2].id).toBe('RL')
      expect(frame.wheels[3].id).toBe('RR')
    })
  })

  describe('A3 presets', () => {
    it('has valid A3_DEFINITION', () => {
      expect(A3_DEFINITION.mass).toBe(1400)
      expect(A3_DEFINITION.wheelbase).toBeCloseTo(2.6)
    })

    it('has valid A3_TUNE', () => {
      expect(A3_TUNE.maxForce).toBe(3200)
      expect(A3_TUNE.maxSteer).toBeCloseTo(0.38)
    })
  })
})
