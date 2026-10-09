import { describe, expect, it } from 'vitest'
import {
  cameraFovFor,
  cameraFovStorageKey,
  nextCameraFovOffset,
  readCameraFovOffset,
  writeCameraFovOffset,
} from '../../src/runtime/camera-fov.js'
import { carMenuItems } from '../../src/catalog/monitors/car.js'
import { vehicleMenuKey } from '../../src/runtime/vehicle-menu.js'
import type { SceneView } from '../../src/presentation/scene-view.js'
import type { SceneDocument } from '../../src/scene/document.js'

function memory() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('camera FOV offset', () => {
  it('moves cockpit and chase together and clamps the range', () => {
    const base = { firstPersonFov: 70, chaseFov: 48 }
    expect(cameraFovFor(base, 10)).toEqual({ firstPersonFov: 80, chaseFov: 58 })
    expect(nextCameraFovOffset(20, '5')).toBe(25)
    expect(nextCameraFovOffset(25, '5')).toBe(25)
    expect(nextCameraFovOffset(-15, '-5')).toBe(-15)
    expect(nextCameraFovOffset(10, 'reset')).toBe(0)
  })

  it('persists the offset and reads junk as 0', () => {
    const storage = memory()
    expect(readCameraFovOffset(storage)).toBe(0)
    writeCameraFovOffset(storage, 10)
    expect(storage.data.get(cameraFovStorageKey)).toBe('10')
    expect(readCameraFovOffset(storage)).toBe(10)
    storage.setItem(cameraFovStorageKey, 'wide')
    expect(readCameraFovOffset(storage)).toBe(0)
  })

  it('J → VISTA FOV reports through the host callback', () => {
    const page = carMenuItems.find((item) => item.id === 'fov')!
    expect(page.children?.map((item) => item.action?.value).filter(Boolean)).toEqual([
      '5',
      '-5',
      'reset',
    ])
    const steps: string[] = []
    const reports: string[] = []
    const view = {
      vehicleMenu: () => ({
        open: true,
        key: () => ({ handled: true, action: { type: 'vehicle.fov', value: '5' } }),
      }),
    } as unknown as SceneView
    vehicleMenuKey(
      view,
      { version: 1, name: 'x', entities: [] } as SceneDocument,
      's3',
      'Enter',
      false,
      (message) => reports.push(message),
      () => {},
      undefined,
      undefined,
      (step) => {
        steps.push(step)
        return 'FOV cabina 75° · conducción 53°'
      },
    )
    expect(steps).toEqual(['5'])
    expect(reports).toEqual(['FOV cabina 75° · conducción 53°'])
  })
})
