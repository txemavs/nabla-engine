/** Fit reusable instrumentation to an authored GLB screen plane. */
import { Group, Mesh, Vector3, type Object3D } from 'three'
import type { InstrumentMounts, SurfaceQuad } from './mounts.js'

export function authoredScreenMounts(
  model: Object3D,
  pixels: { width: number; height: number },
): InstrumentMounts | undefined {
  let screen: Mesh | undefined
  model.traverse((node) => {
    if (node instanceof Mesh && node.userData.role === 'dynamic-dashboard-display') screen = node
  })
  if (!screen || !screen.parent) return undefined
  const { widthMeters: width, heightMeters: height } = screen.userData
  if (!(Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0))
    throw new Error('Authored dashboard requires positive metre dimensions')
  screen.updateMatrix()
  const quad = [
    [-width / 2, height / 2, 0.001],
    [width / 2, height / 2, 0.001],
    [-width / 2, -height / 2, 0.001],
    [width / 2, -height / 2, 0.001],
  ].map((p) => new Vector3(...p).applyMatrix4(screen!.matrix).toArray()) as SurfaceQuad
  const support = new Group()
  screen.parent.add(support)
  const centre = new Vector3(0, 0, 0.001).applyMatrix4(screen.matrix)
  return {
    parent: screen.parent,
    support,
    sharedSurface: true,
    cluster: {
      position: centre.toArray(),
      rotation: screen.quaternion.toArray(),
      scale: Math.min(width / pixels.width, height / pixels.height),
      name: 'Authored dashboard instruments',
    },
    menu: quad,
    navigator: quad,
    navigatorName: 'Authored dashboard navigation',
    retract: { offset: [0, 0, 0], durationMs: 1 },
    dispose() {
      support.removeFromParent()
    },
  }
}
