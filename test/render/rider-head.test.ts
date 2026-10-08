/** The two-wheeler cockpit head eases to the rider's shift and tuck: ~1.5 s, no overshoot, no jitter. */
import { describe, expect, it } from 'vitest'
import { gameCameraDefaults } from '../../src/config/camera.js'
import { easeRiderHead, type RiderHeadEase } from '../../src/render/entity/rider-head.js'
import { riderHeadOffset } from '../../src/render/entity/view.js'

const response = gameCameraDefaults.riderHeadResponse

/** Run `seconds` at `hz`, the target given per time, and return the eased values per frame. */
function follow(target: (t: number) => number[], seconds: number, hz = 60, start = target(0)) {
  let ease: RiderHeadEase | undefined = easeRiderHead(undefined, start, response, 0)
  const frames: { t: number; value: number[] }[] = []
  for (let i = 1; i <= Math.round(seconds * hz); i++) {
    const t = i / hz
    ease = easeRiderHead(ease, target(t), response, 1 / hz)
    frames.push({ t, value: [...ease.value] })
  }
  return frames
}

describe('rider head easing', () => {
  it('snaps on the first pose (boarding, a new vehicle)', () => {
    expect(easeRiderHead(undefined, [0.1, -0.2, 1], response, 1 / 60).value).toEqual([0.1, -0.2, 1])
  })

  it('a step (a key press, the automatic position) settles in 1–2 s without overshoot', () => {
    // Shift 12 cm right and 15 cm forward, full tuck.
    const goal = [0.12, -0.15, 1]
    const frames = follow((t) => (t > 0 ? goal : [0, 0, 0]), 3, 60, [0, 0, 0])
    const share = (f: { value: number[] }) => f.value.map((v, i) => v / goal[i])
    for (const f of frames) for (const s of share(f)) expect(s).toBeLessThanOrEqual(1 + 1e-9)
    const at = (t: number) => share(frames.find((f) => f.t >= t - 1e-9)!)
    // Clearly not snapping: under 40% after 0.3 s, past half by 0.75 s.
    for (const s of at(0.3)) expect(s).toBeLessThan(0.4)
    for (const s of at(0.75)) expect(s).toBeGreaterThan(0.5)
    // Within 2% somewhere between 1 and 2 seconds.
    const settled = frames.find((f) => share(f).every((s) => s > 0.98))!.t
    expect(settled).toBeGreaterThan(1)
    expect(settled).toBeLessThan(2)
  })

  it('filters frame-to-frame jitter in the rider shift', () => {
    // The auto body position dithering ±2 cm every frame around 5 cm.
    const frames = follow((t) => [0.05 + (Math.round(t * 60) % 2 ? 0.02 : -0.02), 0, 0], 4)
    const late = frames.filter((f) => f.t > 2).map((f) => f.value[0])
    const swing = Math.max(...late) - Math.min(...late)
    expect(swing).toBeLessThan(0.04 * 0.05)
    expect(Math.abs(late.reduce((a, b) => a + b, 0) / late.length - 0.05)).toBeLessThan(0.002)
  })

  it('does not depend on the frame rate', () => {
    const goal = [0.1, 0, 0]
    const at = (hz: number) => follow(() => goal, 0.8, hz, [0, 0, 0]).at(-1)!.value[0]
    expect(Math.abs(at(30) - at(144))).toBeLessThan(0.002)
  })

  it('the eased inputs give the same final head position as the raw ones', () => {
    const base = [0, 1.36, 0.27]
    const goal = [0.08, -0.12, 0.6]
    const eased = follow(() => goal, 4, 60, [0, 0, 0]).at(-1)!.value
    const final = riderHeadOffset(base, [eased[0], eased[1]], eased[2], [0, -0.2, -0.1])
    const raw = riderHeadOffset(base, [goal[0], goal[1]], goal[2], [0, -0.2, -0.1])
    final.forEach((v, i) => expect(v).toBeCloseTo(raw[i], 4))
  })
})
