import { expect, it } from 'vitest'
import { rasterizeTile } from './compose-photo.js'

it('paints the north edge at the top and lets a higher triangle cover the centre', () => {
  const red = new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0])
  const ground = rasterizeTile(
    [
      {
        position: new Float32Array([-50, 1, -50, 50, 1, -50, 50, 1, 50, -50, 1, 50]),
        color: red,
        index: new Uint32Array([0, 1, 2, 0, 2, 3]),
      },
    ],
    100,
    8,
  )
  expect(ground[0]).toBe(255)
  expect(ground[1]).toBe(0)
  const centre = (4 * 8 + 4) * 4
  expect(ground[centre]).toBe(255)
  const covered = rasterizeTile(
    [
      {
        position: new Float32Array([-50, 1, -50, 50, 1, -50, 50, 1, 50, -50, 1, 50]),
        color: red,
        index: new Uint32Array([0, 1, 2, 0, 2, 3]),
      },
      {
        position: new Float32Array([-10, 8, -10, 10, 8, -10, 0, 8, 10]),
        color: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
      },
    ],
    100,
    8,
  )
  expect(covered[centre]).toBe(0)
  expect(covered[centre + 1]).toBe(255)
  expect(covered[0]).toBe(255)
})
