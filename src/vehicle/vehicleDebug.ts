/**
 * Debug draw: COM / cabin / mesh origins + force / velocity / wheel rays.
 * Metres Y-up → GL mm (same as ``metersYupModel``).
 *
 * Ported from Agency (txemavs/agency-ui main):
 *   stage/vehicle/vehicleDebug.ts
 *
 * Note: Some functions omitted due to missing dependencies (drive.ts, vehiclePresent.ts).
 * Exported: DebugLine type, cross() helper, debugLinesFromFrame().
 */
import { MM_PER_M } from '../world.js'
import type { VehicleDebugFrame, VehicleVec3 } from './vehicleDef.js'

export type DebugLine = {
  a: [number, number, number]
  b: [number, number, number]
  rgb: [number, number, number]
}

function mm(v: VehicleVec3): [number, number, number] {
  return [v.x * MM_PER_M, v.y * MM_PER_M, v.z * MM_PER_M]
}

function line(a: VehicleVec3, b: VehicleVec3, rgb: [number, number, number]): DebugLine {
  return { a: mm(a), b: mm(b), rgb }
}

const AXIS: Record<'x' | 'y' | 'z', [number, number, number]> = {
  x: [1, 0.22, 0.22],
  y: [0.25, 0.95, 0.3],
  z: [0.3, 0.55, 1],
}

/** Cross at a point so an origin reads as a point, not a floating tip. */
export function cross(at: VehicleVec3, rgb: [number, number, number], arm = 0.12): DebugLine[] {
  return [
    line({ x: at.x - arm, y: at.y, z: at.z }, { x: at.x + arm, y: at.y, z: at.z }, rgb),
    line({ x: at.x, y: at.y - arm, z: at.z }, { x: at.x, y: at.y + arm, z: at.z }, rgb),
    line({ x: at.x, y: at.y, z: at.z - arm }, { x: at.x, y: at.y, z: at.z + arm }, rgb),
  ]
}

export function debugLinesFromFrame(frame: VehicleDebugFrame): DebugLine[] {
  const lines: DebugLine[] = [
    ...cross(frame.com, [1, 0.95, 0.2], 0.16),
    line(frame.com, frame.axes.x, AXIS.x),
    line(frame.com, frame.axes.y, AXIS.y),
    line(frame.com, frame.axes.z, AXIS.z),
    line(frame.com, frame.vel, [0.2, 0.95, 1]),
    line(frame.com, frame.omega, [0.95, 0.35, 1]),
    ...cross(frame.mesh, [1, 1, 1], 0.1),
    ...cross(frame.cabin, [1, 0.65, 0.15], 0.1),
  ]
  for (const w of frame.wheels) {
    const spoke: [number, number, number] = w.inContact ? [1, 0.85, 0.2] : [0.45, 0.45, 0.5]
    lines.push(line(w.conn, w.center, [0.7, 0.75, 0.8]))
    if (w.contact) lines.push(line(w.center, w.contact, spoke))
    else lines.push(...cross(w.center, spoke, 0.08))
    if (Math.abs(w.engine) > 1) {
      const along = {
        x: w.center.x + (frame.axes.z.x - frame.com.x) * (-w.engine / 4000),
        y: w.center.y + (frame.axes.z.y - frame.com.y) * (-w.engine / 4000),
        z: w.center.z + (frame.axes.z.z - frame.com.z) * (-w.engine / 4000),
      }
      lines.push(line(w.center, along, [1, 0.45, 0.1]))
    }
  }
  return lines
}
