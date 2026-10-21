import { Matrix4, Object3D, Quaternion, Vector3 } from 'three'

/** One placement candidate in the frame's render reference space. */
export interface XRHitPose {
  readonly position: Vector3
  readonly orientation: Quaternion
  /** Column-major pose matrix (Y axis is the surface normal). */
  readonly matrix: Matrix4
}

/**
 * Generic WebXR hit-test from the viewer (screen centre / gaze ray).
 * Owns no geometry or materials: the host supplies any reticle Object3D and decides what to place.
 * Requires the optional 'hit-test' feature; when the session lacks it, `supported` stays false.
 */
export class XRHitTest {
  private source: XRHitTestSource | null = null
  private session: XRSession | null = null
  private requesting = false
  private readonly pose = {
    position: new Vector3(),
    orientation: new Quaternion(),
    matrix: new Matrix4(),
  }
  private hasHit = false
  private failed = false
  /** Optional reticle; shown only while a hit exists and positioned on it every frame. */
  reticle: Object3D | null = null

  /** True after the source was created on the current session. */
  get supported(): boolean {
    return this.source !== null
  }
  /** False when the runtime refused hit-test for this session. */
  get unavailable(): boolean {
    return this.failed
  }
  /** Latest hit, or null. The returned object is reused; copy it to keep it. */
  get hit(): XRHitPose | null {
    return this.hasHit ? this.pose : null
  }

  /** Start on a session. Safe to call every frame; only the first call per session requests. */
  start(session: XRSession): void {
    if (this.session === session) return
    this.stop()
    this.session = session
    session.addEventListener?.('end', this.stop)
    if (!session.requestHitTestSource || !session.requestReferenceSpace) {
      this.failed = true
      return
    }
    this.requesting = true
    void session
      .requestReferenceSpace('viewer')
      .then((viewer) => session.requestHitTestSource!({ space: viewer }))
      .then((source) => {
        if (this.session !== session || !source) source?.cancel()
        else this.source = source
      })
      .catch(() => {
        if (this.session === session) this.failed = true
      })
      .finally(() => {
        this.requesting = false
      })
  }

  /** Update from the XR frame using the space the renderer uses for this frame. */
  update(frame: XRFrame, space: XRReferenceSpace | null): XRHitPose | null {
    this.hasHit = false
    if (this.source && space) {
      const result = frame.getHitTestResults(this.source)[0]
      const pose = result?.getPose(space)
      if (pose && pose.transform.matrix.every(Number.isFinite)) {
        this.pose.matrix.fromArray(pose.transform.matrix)
        this.pose.matrix.decompose(this.pose.position, this.pose.orientation, new Vector3())
        this.hasHit = true
      }
    }
    if (this.reticle) {
      this.reticle.visible = this.hasHit
      if (this.hasHit) this.applyTo(this.reticle)
    }
    return this.hit
  }

  /** Copy the current hit onto an object (in its parent's space if the parent is at origin). Returns false without a hit. */
  place(object: Object3D, keepYaw = false): boolean {
    if (!this.hasHit) return false
    this.applyTo(object, keepYaw)
    return true
  }

  private applyTo(object: Object3D, keepYaw = false): void {
    object.position.copy(this.pose.position)
    if (!keepYaw) object.quaternion.copy(this.pose.orientation)
    object.updateMatrixWorld(true)
  }

  readonly stop = (): void => {
    this.session?.removeEventListener?.('end', this.stop)
    this.source?.cancel()
    this.source = null
    this.session = null
    this.hasHit = false
    this.failed = false
    this.requesting = false
    if (this.reticle) this.reticle.visible = false
  }

  /** True while the source request is in flight. */
  get pending(): boolean {
    return this.requesting
  }
}
