import { Euler, Quaternion } from 'three'

/** Host-owned session lifecycle. Rendering uses one setAnimationLoop in both modes. */
export class XRSessionController {
  private session: XRSession | null = null
  private floor: XRReferenceSpace | null = null
  private pending = false
  private closed = false
  private centerRequested = false

  constructor(
    private readonly xr: {
      setSession(session: XRSession | null): Promise<void>
      setReferenceSpace(space: XRReferenceSpace): void
    },
    private readonly changed: (active: boolean) => void,
    private readonly report: (error: unknown) => void,
  ) {}

  get active(): boolean {
    return this.session !== null
  }

  /** Call directly from a user gesture; never await feature detection before requesting. */
  async enter(system: XRSystem): Promise<void> {
    if (this.pending || this.session || this.closed) return
    this.pending = true
    let session: XRSession | undefined
    try {
      session = await system.requestSession('immersive-vr', {
        requiredFeatures: ['local-floor'],
      })
      if (this.closed) {
        await session.end()
        return
      }
      this.session = session
      session.addEventListener('end', this.ended)
      this.floor = await session.requestReferenceSpace('local-floor')
      if (this.session !== session || this.closed) return
      this.floor.addEventListener('reset', this.recenter)
      await this.xr.setSession(session)
      if (this.session !== session || this.closed) return
      this.centerRequested = true
      this.changed(true)
    } catch (error) {
      if (session && this.session === session) {
        // End before restoring the desktop. Report an end failure as well.
        try {
          await session.end()
        } catch (endError) {
          this.report(endError)
        }
        this.ended()
      }
      throw error
    } finally {
      this.pending = false
    }
  }

  readonly recenter = (): void => {
    this.centerRequested = true
  }

  /** Preserve floor height; only horizontal position and yaw are recentered. */
  update(frame: XRFrame): void {
    if (!this.centerRequested || !this.floor) return
    const pose = frame.getViewerPose(this.floor)
    if (!pose) return
    const { position, orientation } = pose.transform
    const yaw = new Euler().setFromQuaternion(
      new Quaternion(orientation.x, orientation.y, orientation.z, orientation.w),
      'YXZ',
    ).y
    const rotation = new Quaternion().setFromEuler(new Euler(0, yaw, 0))
    this.xr.setReferenceSpace(
      this.floor.getOffsetReferenceSpace(
        new XRRigidTransform({ x: position.x, y: 0, z: position.z }, rotation),
      ),
    )
    this.centerRequested = false
  }

  async exit(): Promise<void> {
    await this.session?.end()
  }

  /** Terminal: late permission grants are immediately ended. */
  async dispose(): Promise<void> {
    this.closed = true
    await this.exit()
  }

  private readonly ended = (): void => {
    this.session?.removeEventListener('end', this.ended)
    this.floor?.removeEventListener('reset', this.recenter)
    this.session = null
    this.floor = null
    this.centerRequested = false
    this.changed(false)
  }
}
