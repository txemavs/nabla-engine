import * as THREE from 'three'
import { GameXR } from '../xr.js'

/** AR view of the same XR runtime. No application content or physics world is created. */
export class GameAR extends GameXR {
  private poseTracked = false
  constructor(
    private readonly arRenderer: THREE.WebGLRenderer,
    private readonly arCamera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
    changed: (active: boolean) => void,
    report: (error: unknown) => void,
  ) {
    super(arRenderer, arCamera, scene, changed, report)
  }
  async enterAR(system: XRSystem): Promise<void> {
    try {
      await this.enter(system, 'immersive-ar')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotSupportedError')
        throw new Error(
          'Este navegador no admite AR unbounded con referencia de suelo. Actualiza Quest Browser; no se ha iniciado una sesión con límite.',
        )
      throw error
    }
    if (this.arRenderer.xr.getSession()?.environmentBlendMode === 'opaque') {
      await this.exit()
      throw new Error('This AR view requires passthrough.')
    }
  }
  override get visible(): boolean {
    return super.visible && this.session.referenceReady && this.poseTracked
  }
  override update(frame: XRFrame): void {
    super.update(frame)
    const space = this.arRenderer.xr.getReferenceSpace()
    const pose = space && frame.getViewerPose(space)
    this.poseTracked = !!pose
    if (!pose) return
    const p = pose.transform.position,
      q = pose.transform.orientation
    this.arCamera.position.set(p.x, p.y, p.z)
    this.arCamera.quaternion.set(q.x, q.y, q.z, q.w)
    this.arCamera.updateWorldMatrix(true, false)
  }
}
