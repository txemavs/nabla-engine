import { expect, it } from 'vitest'
import type {
  PropertySpec,
  TelemetrySource,
  VehicleTelemetry,
  Mount,
} from '../../docs/architecture/composition-contracts.js'
it('expresses telemetry, leases and serializable settings without host or renderer types', () => {
  const telemetry: TelemetrySource<VehicleTelemetry> = {
    read: () => ({
      tick: 1,
      simulationSeconds: 1 / 60,
      value: { speedMetresPerSecond: 10, gear: 2, rpm: 2000, contacts: [] },
    }),
  }
  const mirror: PropertySpec = {
    key: 'mirrorTilt',
    label: 'Mirror elevation',
    unit: 'deg',
    defaultValue: -2,
    minimum: -5,
    maximum: 12,
    step: 1,
    persistence: 'scene',
  }
  let attached = 0
  const mount: Mount<readonly number[], { id: string }> = {
    id: 'wall',
    localPose: [0, 0, 0],
    attach: () => {
      attached++
      let disposed = false
      return {
        dispose: () => {
          if (!disposed) {
            attached--
            disposed = true
          }
        },
      }
    },
  }
  const lease = mount.attach({ id: 'same-monitor' })
  expect(telemetry.read().value.speedMetresPerSecond * 3.6).toBe(36)
  expect(JSON.parse(JSON.stringify(mirror)).defaultValue).toBe(-2)
  lease.dispose()
  lease.dispose()
  expect(attached).toBe(0)
})
