import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { AssetPack } from '../render/entity/asset-pack.js'

interface HandPose {
  name: string
  open: [number, number, number, number]
  closed: [number, number, number, number]
  openPosition?: [number, number, number]
  closedPosition?: [number, number, number]
  openScale?: [number, number, number]
  closedScale?: [number, number, number]
}

/** Lightweight controller-driven glove: five articulated fingers, no hand-tracking permission. */
export class XRControllerHand {
  readonly root = new THREE.Group()
  private readonly material = new THREE.MeshStandardMaterial({ color: '#859ba8', roughness: 0.85 })
  private readonly cuffMaterial = new THREE.MeshStandardMaterial({
    color: '#233746',
    roughness: 0.95,
  })
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly fingers: THREE.Group[][] = []
  readonly indexTip = new THREE.Object3D()
  private readonly thumb = new THREE.Group()

  private model: THREE.Object3D | null = null
  private modelFingers: THREE.Object3D[][] = []
  private modelPoses:
    | {
        open: THREE.Quaternion
        closed: THREE.Quaternion
        openPosition?: THREE.Vector3
        closedPosition?: THREE.Vector3
        openScale?: THREE.Vector3
        closedScale?: THREE.Vector3
      }[][]
    | null = null
  private loadVersion = 0
  private disposed = false

  /** GLB contract: nablaHand extras map five fingers to named bones and open/closed quaternions.
   * Legacy assets use finger-{0..4}-{0..2} bones (index through thumb), index-tip marker.
   * Bind pose uses metres, +Y back of hand, -Z fingers, thumb on -X.
   */
  async loadModel(url: string): Promise<void> {
    const version = ++this.loadVersion
    const loader = new GLTFLoader()
    const buffer = await new AssetPack().read(url)
    const { scene } = buffer
      ? await loader.parseAsync(buffer, url.slice(0, url.lastIndexOf('/') + 1))
      : await loader.loadAsync(url)
    if (this.disposed || version !== this.loadVersion) {
      this.disposeModel(scene)
      return
    }
    let descriptor: { fingers: HandPose[][]; tip: string } | undefined
    scene.traverse((object) => {
      if (object.userData.nablaHand) descriptor = object.userData.nablaHand
    })
    const validQuaternion = (value: unknown): value is [number, number, number, number] =>
      Array.isArray(value) &&
      value.length === 4 &&
      value.every(Number.isFinite) &&
      value.reduce((sum, v) => sum + v * v, 0) > 0.0001
    const validVector = (value: unknown): boolean =>
      value === undefined ||
      (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite))
    if (
      descriptor &&
      (!Array.isArray(descriptor.fingers) ||
        descriptor.fingers.length !== 5 ||
        descriptor.fingers.some(
          (finger) =>
            !Array.isArray(finger) ||
            finger.length < 1 ||
            finger.length > 5 ||
            finger.some(
              (pose) =>
                !pose ||
                typeof pose.name !== 'string' ||
                !validQuaternion(pose.open) ||
                !validQuaternion(pose.closed) ||
                !validVector(pose.openPosition) ||
                !validVector(pose.closedPosition) ||
                !validVector(pose.openScale) ||
                !validVector(pose.closedScale),
            ),
        ))
    ) {
      this.disposeModel(scene)
      throw new Error('Invalid hand pose descriptor')
    }
    const fingers = descriptor
      ? descriptor.fingers.map((finger) => finger.map((pose) => scene.getObjectByName(pose.name)))
      : Array.from({ length: 5 }, (_, f) =>
          Array.from({ length: 3 }, (_, j) => scene.getObjectByName(`finger-${f}-${j}`)),
        )
    const tip = scene.getObjectByName(descriptor?.tip ?? 'index-tip')
    if (!tip || fingers.some((finger) => finger.some((joint) => !joint))) {
      this.disposeModel(scene)
      throw new Error('Hand GLB is missing finger bones or index-tip')
    }
    const poses =
      descriptor?.fingers.map((finger) =>
        finger.map((pose) => ({
          open: new THREE.Quaternion().fromArray(pose.open).normalize(),
          closed: new THREE.Quaternion().fromArray(pose.closed).normalize(),
          openPosition: pose.openPosition
            ? new THREE.Vector3().fromArray(pose.openPosition)
            : undefined,
          closedPosition: pose.closedPosition
            ? new THREE.Vector3().fromArray(pose.closedPosition)
            : undefined,
          openScale: pose.openScale ? new THREE.Vector3().fromArray(pose.openScale) : undefined,
          closedScale: pose.closedScale
            ? new THREE.Vector3().fromArray(pose.closedScale)
            : undefined,
        })),
      ) ?? null
    if (this.model) this.disposeModel(this.model)
    this.model = scene
    this.modelFingers = fingers as THREE.Object3D[][]
    this.modelPoses = poses
    this.modelFingers.forEach((finger, f) =>
      finger.forEach((joint, j) => {
        if (poses) {
          const pose = poses[f][j]
          joint.quaternion.copy(pose.open)
          if (pose.openPosition) joint.position.copy(pose.openPosition)
          if (pose.openScale) joint.scale.copy(pose.openScale)
        }
      }),
    )
    for (const child of this.root.children) child.visible = false
    this.indexTip.position.set(0, 0, 0)
    tip.add(this.indexTip)
    scene.traverse((object) => {
      if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false
    })
    this.root.add(scene)
  }

  private disposeModel(model: THREE.Object3D): void {
    model.removeFromParent()
    const textures = new Set<THREE.Texture>()
    model.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose()
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) textures.add(value)
          material.dispose()
        }
        if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose()
      }
    })
    textures.forEach((texture) => texture.dispose())
  }

  constructor() {
    this.root.name = 'Controller glove'
    const ellipsoid = (size: number[], at: number[], material = this.material) => {
      const geometry = new THREE.SphereGeometry(1, 10, 6)
      this.geometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, material)
      mesh.scale.set(size[0], size[1], size[2])
      mesh.position.fromArray(at)
      this.root.add(mesh)
    }
    ellipsoid([0.039, 0.017, 0.048], [0, 0, 0.008])
    ellipsoid([0.031, 0.021, 0.02], [0, 0, 0.058], this.cuffMaterial)
    for (let finger = 0; finger < 4; finger++) {
      const joints: THREE.Group[] = []
      let parent = this.root
      const lengths = [0.034, 0.024, 0.019].map((n) => n * [0.9, 1, 0.94, 0.74][finger])
      for (let part = 0; part < 3; part++) {
        const joint = new THREE.Group()
        joint.position.set(
          part === 0 ? -0.027 + finger * 0.018 : 0,
          0,
          part === 0 ? -0.027 : -lengths[part - 1],
        )
        parent.add(joint)
        const geometry = new THREE.CapsuleGeometry(
          0.0075 - finger * 0.0004,
          Math.max(0.003, lengths[part] - 0.015),
          3,
          6,
        )
        this.geometries.push(geometry)
        const mesh = new THREE.Mesh(geometry, this.material)
        mesh.rotation.x = Math.PI / 2
        mesh.position.z = -lengths[part] / 2
        joint.add(mesh)
        joints.push(joint)
        parent = joint
      }
      this.fingers.push(joints)
      if (finger === 0) {
        this.indexTip.position.z = -lengths[2]
        parent.add(this.indexTip)
      }
    }
    this.thumb.position.set(-0.031, -0.005, 0.015)
    this.thumb.rotation.y = 0.8
    this.root.add(this.thumb)
    for (let i = 0; i < 2; i++) {
      const geometry = new THREE.CapsuleGeometry(0.009, 0.018, 3, 6)
      this.geometries.push(geometry)
      const mesh = new THREE.Mesh(geometry, this.material)
      mesh.rotation.x = Math.PI / 2
      mesh.position.z = -0.014 - i * 0.024
      this.thumb.add(mesh)
    }
    this.root.visible = false
  }
  update(source: XRInputSource | null, tracked: boolean): void {
    this.root.visible = tracked && !!source && !source.hand && source.handedness !== 'none'
    if (!this.root.visible) return
    this.root.scale.x = source!.handedness === 'left' ? -1 : 1
    const amount = (i: number) => {
      const b = source!.gamepad?.buttons[i]
      return THREE.MathUtils.clamp(b?.value ?? (b?.pressed ? 1 : 0), 0, 1)
    }
    const grip = amount(1),
      trigger = amount(0)
    this.fingers.forEach((joints, i) =>
      joints.forEach((joint, j) => {
        joint.rotation.x = -(
          0.12 +
          (i === 0 ? Math.max(trigger, grip * 0.35) : grip) * [1.1, 1.25, 0.9][j]
        )
      }),
    )
    this.modelFingers.forEach((joints, i) =>
      joints.forEach((joint, j) => {
        const curl = i === 0 ? Math.max(trigger, grip * 0.35) : grip
        const pose = this.modelPoses?.[i][j]
        if (pose) {
          joint.quaternion.slerpQuaternions(pose.open, pose.closed, curl)
          if (pose.openPosition && pose.closedPosition)
            joint.position.lerpVectors(pose.openPosition, pose.closedPosition, curl)
          if (pose.openScale && pose.closedScale)
            joint.scale.lerpVectors(pose.openScale, pose.closedScale, curl)
          return
        }
        joint.rotation.x = -curl * (i === 4 ? [0.35, 0.6, 0.65][j] : [0.85, 1.1, 0.8][j])
        if (i === 4) joint.rotation.z = curl * (j === 0 ? 0.7 : 0)
      }),
    )
    this.thumb.rotation.y = 0.8 - grip * 0.65
    this.thumb.rotation.z = -grip * 0.5
  }
  dispose(): void {
    this.disposed = true
    ++this.loadVersion
    if (this.model) this.disposeModel(this.model)
    this.root.removeFromParent()
    for (const geometry of this.geometries) geometry.dispose()
    this.material.dispose()
    this.cuffMaterial.dispose()
  }
}
