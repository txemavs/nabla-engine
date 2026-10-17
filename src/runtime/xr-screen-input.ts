import { Matrix4, Quaternion, Vector3 } from 'three'

/** Native WebXR screen taps only. Controller/hand selection keeps its existing route. */
export class XRScreenInput {
  private session: XRSession | null = null
  private readonly origin = new Vector3()
  private readonly direction = new Vector3()
  private readonly rotation = new Quaternion()
  constructor(
    private readonly options: {
      referenceSpace: () => XRReferenceSpace | null
      worldMatrix: () => Matrix4
      enabled: () => boolean
      select: (origin: Vector3, direction: Vector3) => void
    },
  ) {}
  private readonly selected = (event: XRInputSourceEvent): void => {
    if (event.inputSource.targetRayMode !== 'screen' || !this.options.enabled()) return
    const space = this.options.referenceSpace()
    if (!space || event.frame.session !== this.session) return
    const pose = event.frame.getPose(event.inputSource.targetRaySpace, space)
    if (!pose) return
    const p = pose.transform.position,
      q = pose.transform.orientation
    const world = this.options.worldMatrix()
    this.origin.set(p.x, p.y, p.z).applyMatrix4(world)
    this.rotation.set(q.x, q.y, q.z, q.w)
    this.direction.set(0, 0, -1).applyQuaternion(this.rotation).transformDirection(world)
    this.options.select(this.origin, this.direction)
  }
  bind(session: XRSession | null): void {
    this.session?.removeEventListener('select', this.selected)
    this.session = session
    session?.addEventListener('select', this.selected)
  }
  dispose(): void {
    this.bind(null)
  }
}
