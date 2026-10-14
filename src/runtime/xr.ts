import { readXRQuality, saveXRQuality, type XRQualitySettings } from './xr-quality.js'
import { XRCalibrationScreen } from './xr-calibration-screen.js'
import { XRCalibration } from './xr-calibration.js'
import { XRControllerHand } from './xr-hand.js'
import { XRStats } from './xr-stats.js'
import * as THREE from 'three'
import { XRSessionController } from './xr-session.js'
import { XRGameInput } from './xr-input.js'

/** Engine-owned immersive view. The browser runtime retains physics and terrain ownership. */
export class GameXR {
  readonly calibration = new XRCalibration()
  calibrationScreen: XRCalibrationScreen | null = null
  enableCalibrationScreen(): void {
    if (this.calibrationScreen) return
    this.calibrationScreen = new XRCalibrationScreen(this.scene, this.calibration)
  }

  showCalibrationScreen(): void {
    this.enableCalibrationScreen()
    this.calibrationScreen!.show(true)
  }
  get gameplaySources(): readonly XRInputSource[] {
    return this.sources.filter((source) => !this.calibrationOwns(source))
  }
  calibrationOwns(source: XRInputSource | null): boolean {
    return !!source && !!this.calibrationScreen?.captured.has(source)
  }
  /** Hands currently operating a physical vehicle control cannot click floating UI. */
  quality = readXRQuality()
  setQuality(patch: Partial<XRQualitySettings>): void {
    Object.assign(this.quality, patch)
    saveXRQuality(this.quality)
    this.renderer.xr.setFoveation(this.quality.foveation)
    if (!this.active) this.renderer.xr.setFramebufferScaleFactor(this.quality.scale)
  }
  toggleMenu(): void {
    this.enableCalibrationScreen()
    const screen = this.calibrationScreen!
    if (screen.isOpen) screen.hide()
    else {
      screen.development = false
      screen.show()
    }
  }
  reservedInput: (source: XRInputSource) => boolean = () => false
  interactCalibration(
    enabled: boolean,
    weaponTip: (source: XRInputSource) => THREE.Vector3 | null,
  ): void {
    const pointers = this.grabHands
      .filter((hand) => !this.reservedInput(hand.source!))
      .map((hand) => {
        const tip = weaponTip(hand.source!)
        return {
          source: hand.source!,
          grip: hand.grip,
          armed: !!tip,
          tip: tip ?? hand.visual.indexTip.getWorldPosition(new THREE.Vector3()),
          aim: hand.aim,
        }
      })
    this.calibrationScreen?.interact(pointers, enabled)
  }

  private readonly stats = new XRStats()
  onStats?: (text: string) => void
  grabStatus = 'Agarre v2'

  /** Retained host hook; statistics are delivered through onStats. */
  enableStats(): void {
    // Statistics remain available to the monitor without a head-mounted overlay.
  }

  recordStats(time: number, cpu: number, physics: number, calls: number, triangles: number): void {
    const sample = this.stats.sample(time, cpu, physics, calls, triangles)
    const fps = sample?.match(/FPS app ([\d.]+)/)?.[1]
    if (!fps) return
    const text = `${fps} FPS`
    this.onStats?.(text)
  }

  /** Legacy host hooks: all visible actions now live on the monitor. */
  enableTerrainButton(_action: () => Promise<void>): void {}
  setTerrainStatus(_text: string): void {}

  /** Retained host hook; exit is on the monitor. */
  enableExitButton(): void {
    // Exit is provided by the monitor.
  }

  readonly rig = new THREE.Group()
  readonly anchorCamera = new THREE.PerspectiveCamera()
  readonly input = new XRGameInput()
  readonly session: XRSessionController
  private height: number | null = null
  private readonly headPosition = new THREE.Vector3(0, 1.65, 0)
  private readonly headRotation = new THREE.Quaternion()
  headYaw = 0
  private mounted = false
  private savedParent: THREE.Object3D | null = null
  private readonly savedPosition = new THREE.Vector3()
  private readonly savedRotation = new THREE.Quaternion()
  private readonly hands: {
    grip: THREE.Group
    visual: XRControllerHand
    aim: THREE.Group
    mount: THREE.Group
    source: XRInputSource | null
  }[] = []
  private tracked: XRInputSource[] = []
  get sources(): readonly XRInputSource[] {
    return this.tracked
  }
  get grabHands() {
    return this.hands.filter((hand) => !!hand.source && this.tracked.includes(hand.source))
  }
  get rightHand() {
    return this.hands.find(
      (hand) => hand.source?.handedness === 'right' && this.tracked.includes(hand.source),
    )
  }

  /** Load application-owned articulated gloves, retaining procedural hands on failure. */
  async setHandModel(url: string): Promise<void> {
    await Promise.all(this.hands.map((hand) => hand.visual.loadModel(url)))
  }

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly scene: THREE.Scene,
    changed: (active: boolean) => void,
    report: (error: unknown) => void,
  ) {
    scene.add(this.rig)
    renderer.xr.enabled = true
    renderer.xr.setReferenceSpaceType('local-floor')
    renderer.xr.setFramebufferScaleFactor(this.quality.scale)
    renderer.xr.setFoveation(this.quality.foveation)
    this.session = new XRSessionController(
      renderer.xr,
      (active) => {
        this.input.reset()
        this.stats.reset()
        this.calibrationScreen?.suspend()
        this.height = null
        this.headPosition.set(0, 1.65, 0)
        this.headRotation.identity()
        if (active) {
          this.mounted = true
          this.savedParent = camera.parent
          this.savedPosition.copy(camera.position)
          this.savedRotation.copy(camera.quaternion)
          this.rig.add(camera)
          camera.position.set(0, 0, 0)
          camera.quaternion.identity()
        } else if (this.mounted) {
          this.mounted = false
          camera.removeFromParent()
          this.savedParent?.add(camera)
          camera.position.copy(this.savedPosition)
          camera.quaternion.copy(this.savedRotation)
          this.rig.position.set(0, 0, 0)
          this.rig.quaternion.identity()
        }
        this.rig.visible = active
        changed(active)
      },
      report,
    )
    this.rig.visible = false
    for (let i = 0; i < 2; i++) {
      const grip = renderer.xr.getControllerGrip(i)
      const visual = new XRControllerHand()
      grip.add(visual.root)
      this.rig.add(grip, renderer.xr.getController(i))
      const aim = renderer.xr.getController(i)
      const mount = new THREE.Group()
      mount.rotation.x = -Math.PI / 2
      grip.add(mount)
      const slot = { grip, visual, aim, mount, source: null as XRInputSource | null }
      aim.addEventListener('connected', (event) => {
        slot.source = event.data
      })
      aim.addEventListener('disconnected', () => {
        slot.source = null
      })
      this.hands.push(slot)
    }
  }

  get active(): boolean {
    return this.session.active
  }
  get visible(): boolean {
    return this.renderer.xr.getSession()?.visibilityState === 'visible'
  }
  /** Call from the host's button gesture, after play() has completed. */
  enter(
    system: XRSystem = navigator.xr!,
    mode: 'immersive-vr' | 'immersive-ar' = 'immersive-vr',
  ): Promise<void> {
    if (!system) return Promise.reject(new Error('WebXR requiere HTTPS y un navegador compatible'))
    this.renderer.xr.setFramebufferScaleFactor(this.quality.scale)
    return this.session.enter(system, mode)
  }
  exit(): Promise<void> {
    return this.session.exit()
  }
  recenter(): void {
    this.height = null
    this.session.recenter()
  }

  update(frame: XRFrame): void {
    if (!this.visible) this.stats.reset()
    this.session.update(frame)
    const space = this.renderer.xr.getReferenceSpace()
    this.tracked =
      this.visible && space
        ? [...(this.renderer.xr.getSession()?.inputSources ?? [])].filter(
            (source) =>
              !!source.gripSpace &&
              !!frame.getPose(source.gripSpace, space) &&
              !!frame.getPose(source.targetRaySpace, space),
          )
        : []
    for (const hand of this.hands) {
      hand.visual.update(hand.source, !!hand.source && this.tracked.includes(hand.source))
      const side = hand.source?.handedness
      if (side === 'left' || side === 'right') {
        this.calibration.apply(hand.visual.root, `hand-${side}`)
        this.calibration.apply(hand.mount, `grip-${side}`)
      }
    }
    const pose = space && frame.getViewerPose(space)
    if (pose) {
      const q = pose.transform.orientation
      const p = pose.transform.position
      this.headPosition.set(p.x, p.y, p.z)
      this.headRotation.set(q.x, q.y, q.z, q.w)
      this.headYaw = new THREE.Euler().setFromQuaternion(
        new THREE.Quaternion(q.x, q.y, q.z, q.w),
        'YXZ',
      ).y
    }
    if (pose && this.height === null) this.height = pose.transform.position.y
  }

  /** Authored eye pose is the seat/standing anchor; tracked head movement stays relative to it. */
  anchor(position: THREE.Vector3, rotation: THREE.Quaternion): void {
    this.rig.quaternion.copy(rotation)
    this.rig.position
      .copy(position)
      .add(new THREE.Vector3(0, -(this.height ?? 1.65), 0).applyQuaternion(rotation))
    // Gameplay reads the current head pose before Three performs its stereo render.
    this.camera.position.copy(this.headPosition)
    this.camera.quaternion.copy(this.headRotation)
    this.rig.updateMatrixWorld(true)
  }

  dispose(): void {
    void this.session.dispose()
    this.input.reset()
    for (const { grip } of this.hands) grip.clear()
    this.calibrationScreen?.dispose()
    for (const hand of this.hands) hand.visual.dispose()
    this.rig.removeFromParent()
  }
}
