import * as THREE from 'three'
import { GameXR } from '../xr.js'
import { XRHitTest } from '../xr-hit-test.js'

/** AR view of the same XR runtime. No application content or physics world is created. */
export class GameAR extends GameXR {
  private poseTracked = false
  /** Viewer hit-test (screen centre). Hosts set `hitTest.reticle` and call `hitTest.place(obj)`. */
  readonly hitTest = new XRHitTest()
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
          'This browser does not support immersive AR (WebXR). Use Chrome on an ARCore Android phone or Quest Browser.',
        )
      throw error
    }
    if (this.arRenderer.xr.getSession()?.environmentBlendMode === 'opaque') {
      await this.exit()
      throw new Error('This AR view requires passthrough.')
    }
  }
  override async exit(): Promise<void> {
    this.hitTest.stop()
    await super.exit()
  }
  override get visible(): boolean {
    return super.visible && this.session.referenceReady && this.poseTracked
  }
  override update(frame: XRFrame): void {
    const wasReady = this.session.referenceReady
    super.update(frame)
    const xrSession = this.arRenderer.xr.getSession()
    if (xrSession) this.hitTest.start(xrSession)
    this.hitTest.update(frame, this.referenceSpace)
    const space = this.referenceSpace
    const pose = space && frame.getViewerPose(space)
    this.poseTracked = wasReady && !!pose && !pose.emulatedPosition
    if (!this.poseTracked || !pose) return
    const p = pose.transform.position,
      q = pose.transform.orientation
    this.arCamera.position.set(p.x, p.y, p.z)
    this.arCamera.quaternion.set(q.x, q.y, q.z, q.w)
    this.arCamera.updateWorldMatrix(true, false)
  }
}
