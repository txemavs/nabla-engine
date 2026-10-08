/** Riding lean is not a rollover: the ground heading and the flip cinematic ignore it. */
import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { GroundHeading, removeLean } from '../../src/render/entity/driving-camera.js'
import { FlipCinematic } from '../../src/runtime/flip-cinematic.js'
import { createGameCameraState } from '../../src/runtime/game-camera.js'

const pose = (yaw: number, lean: number) =>
  new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), yaw)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), lean))

/** A flick from 63° right to 63° left (just inside the fall lean) while turning, 60 fps. */
function slalom(heading: GroundHeading, allowance: number): boolean {
  let tumbled = false,
    yaw = 0
  for (let i = 0; i < 600; i++) {
    const t = i / 60
    const lean = 1.1 * Math.sin(t * 2.8)
    yaw += -lean * 0.6 * (1 / 60)
    heading.update('bike', [t * 20, 0.5, 0], pose(yaw, lean).toArray(), null, 1 / 60, allowance)
    tumbled ||= heading.tumbling
  }
  return tumbled
}

describe('two-wheeler lean in camera rollover detection', () => {
  it('removes lean up to the allowance and keeps the rest', () => {
    const forward = new Vector3(0, 0, -1).applyQuaternion(pose(0.8, 0))
    const up = (lean: number) => new Vector3(0, 1, 0).applyQuaternion(pose(0.8, lean))
    expect(removeLean(up(0.6), forward, 1.15).y).toBeCloseTo(1, 9)
    expect(removeLean(up(-0.6), forward, 1.15).y).toBeCloseTo(1, 9)
    expect(Math.acos(removeLean(up(1.5), forward, 1.15).y)).toBeCloseTo(1.5 - 1.15, 9)
    expect(removeLean(up(0.6), forward, 0).y).toBeCloseTo(Math.cos(0.6), 9)
  })

  it('does not call a hard lean slalom a tumble with the allowance; a car would', () => {
    expect(slalom(new GroundHeading(), 1.15)).toBe(false)
    expect(slalom(new GroundHeading(), 0)).toBe(true)
  })

  it('still flags an end-over-end crash', () => {
    const heading = new GroundHeading()
    let tumbled = false
    for (let i = 0; i < 120; i++) {
      const pitch = (i / 60) * 4
      const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch)
      heading.update('bike', [0, 0.5, -i * 0.2], q.toArray(), null, 1 / 60, 1.15)
      tumbled ||= heading.tumbling
    }
    expect(tumbled).toBe(true)
  })

  it('never arms the flip cinematic from leaning in the cockpit', () => {
    const flip = new FlipCinematic()
    const camera = new PerspectiveCamera()
    const state = createGameCameraState()
    state.mode = 'cockpit'
    let fired = false
    for (let i = 0; i < 300; i++) {
      const lean = 0.7 * Math.sin((i / 60) * 6)
      const q = pose(0, lean)
      // Report the full roll rate: leaning still must not count.
      const rate = 0.7 * 6 * Math.cos((i / 60) * 6) * 5
      fired ||= flip.update(
        1000 + (i * 1000) / 60,
        1 / 60,
        true,
        {
          position: { x: 0, y: 0, z: 0 },
          quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
          linvel: () => ({ x: 0, y: 0, z: -20 }),
          angvel: () => ({ x: 0, y: 0, z: rate }),
          leanAllowance: 1.15,
        },
        camera,
        state,
      )
    }
    expect(fired).toBe(false)
    expect(flip.phase).toBe('idle')
  })
})
