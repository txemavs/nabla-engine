import { Group, Matrix4, Object3D, Vector3 } from 'three'

/** Natural-hand input adapter. Uses the same squeeze/grab contract as controllers. */
export class XRTrackedHand {
  readonly grip = new Group()
  readonly mount = new Group()
  readonly aim = new Group()
  readonly visual = { indexTip: new Object3D() }
  source: XRInputSource | null = null
  private native: XRInputSource | null = null
  private armed = false
  private pinched = false
  private readonly squeeze = { pressed: false, touched: false, value: 0 }
  private readonly pad = {
    buttons: [{ pressed: false, touched: false, value: 0 }, this.squeeze],
    axes: [0, 0, 0, 0],
  }
  constructor(
    readonly side: 'left' | 'right',
    parent: Group,
  ) {
    this.mount.rotation.x = -Math.PI / 2
    this.grip.add(this.mount)
    parent.add(this.grip, this.aim, this.visual.indexTip)
  }
  reset(): void {
    this.source = this.native = null
    this.armed = this.pinched = false
    this.squeeze.pressed = this.squeeze.touched = false
    this.squeeze.value = 0
  }
  /** Returns a menu gesture edge: left thumb/index pinch, with an open palm. */
  update(
    frame: XRFrame,
    space: XRReferenceSpace | null,
    native: XRInputSource | undefined,
  ): boolean {
    if (!space || !native?.hand) {
      this.reset()
      return false
    }
    const joint = (name: XRHandJoint): Vector3 | null => {
      const handle = native.hand!.get(name)
      const pose = handle && frame.getJointPose?.(handle, space)
      if (!pose) return null
      const p = pose.transform.position
      return [p.x, p.y, p.z].every(Number.isFinite) ? new Vector3(p.x, p.y, p.z) : null
    }
    const wrist = joint('wrist'),
      index = joint('index-finger-phalanx-proximal')
    const middle = joint('middle-finger-phalanx-proximal'),
      pinky = joint('pinky-finger-phalanx-proximal')
    const tip = joint('index-finger-tip'),
      thumb = joint('thumb-tip')
    const fingers = (['middle', 'ring', 'pinky'] as const).map((f) => {
      const base = joint(`${f}-finger-phalanx-proximal`),
        end = joint(`${f}-finger-tip`)
      return base && end && wrist
        ? end.distanceTo(wrist) / Math.max(0.01, base.distanceTo(wrist))
        : null
    })
    if (
      !wrist ||
      !index ||
      !middle ||
      !pinky ||
      !tip ||
      !thumb ||
      fingers.some((v) => v === null)
    ) {
      this.reset()
      return false
    }
    const z = wrist.clone().sub(middle).normalize()
    const x = (
      this.side === 'right' ? pinky.clone().sub(index) : index.clone().sub(pinky)
    ).normalize()
    const y = z.clone().cross(x).normalize()
    if (y.lengthSq() < 0.5) {
      this.reset()
      return false
    }
    x.crossVectors(y, z).normalize()
    this.grip.position.copy(wrist).lerp(middle, 0.65)
    this.grip.quaternion.setFromRotationMatrix(new Matrix4().makeBasis(x, y, z))
    this.visual.indexTip.position.copy(tip)
    const ray = frame.getPose(native.targetRaySpace, space)
    if (ray) {
      this.aim.matrix.fromArray(ray.transform.matrix)
      this.aim.matrix.decompose(this.aim.position, this.aim.quaternion, this.aim.scale)
    } else {
      this.aim.position.copy(this.grip.position)
      this.aim.quaternion.copy(this.grip.quaternion)
    }
    if (this.native !== native) {
      this.reset()
      this.native = native
      this.source = new Proxy(native, {
        get: (target, key) => (key === 'gamepad' ? this.pad : Reflect.get(target, key, target)),
      })
    }
    const curl = fingers.reduce<number>((sum, v) => sum + v!, 0) / 3
    if (curl > 1.55) this.armed = true
    const closed = this.armed && curl < (this.squeeze.pressed ? 1.5 : 1.25)
    this.squeeze.pressed = this.squeeze.touched = closed
    this.squeeze.value = closed ? 1 : 0
    const pinch = !closed && tip.distanceTo(thumb) < (this.pinched ? 0.035 : 0.018)
    const menu = this.side === 'left' && this.armed && pinch && !this.pinched
    this.pinched = pinch
    return menu
  }
}
