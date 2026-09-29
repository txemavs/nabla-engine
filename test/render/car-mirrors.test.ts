import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import { raisedMirrorNormal } from '../../src/render/entity/car-mirrors.js'
it('raises the reflected view on either side and preserves the normal length', () => {
  for (const side of [-1, 1]) {
    const normal = new Vector3(side * 0.25, 0.02, 1).normalize()
    const incoming = new Vector3(side * 0.3, -0.3, -1).normalize()
    const raised = raisedMirrorNormal(normal, new Vector3(0, 1, 0), 6)
    expect(raised.length()).toBeCloseTo(1)
    expect(incoming.clone().reflect(raised).y).toBeGreaterThan(
      incoming.clone().reflect(normal).y + 0.15,
    )
  }
})
