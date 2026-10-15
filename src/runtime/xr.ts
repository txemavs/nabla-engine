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
  private armedSources = new Set<XRInputSource>()
  private settingsButton: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  enableCalibrationScreen(): void {
    if (this.calibrationScreen) return
    this.calibrationScreen = new XRCalibrationScreen(this.scene, this.calibration)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.font = '90px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('⚙', 64, 64)
    this.settingsButton = new THREE.Mesh(
      new THREE.PlaneGeometry(0.065, 0.065),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(canvas),
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    )
    this.settingsButton.position.set(-0.02, 0.27, -1)
    this.settingsButton.renderOrder = 10001
    this.settingsButton.visible = this.active
    this.camera.add(this.settingsButton)
  }
  showCalibrationScreen(): void {
    this.enableCalibrationScreen()
    this.calibrationScreen!.show()
  }
  get gameplaySources(): readonly XRInputSource[] {
    return this.sources.filter((source) => !this.calibrationScreen?.captured.has(source))
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
    this.armedSources.clear()
    this.calibrationScreen?.interact(
      this.grabHands
        .filter((hand) => !this.reservedInput(hand.source!))
        .map((hand) => {
          const tip = weaponTip(hand.source!)
          if (tip) this.armedSources.add(hand.source!)
          return {
            source: hand.source!,
            armed: !!tip,
            tip: tip ?? hand.visual.indexTip.getWorldPosition(new THREE.Vector3()),
            aim: hand.aim,
          }
        }),
      enabled,
    )
  }
  private readonly stats = new XRStats()
  private statsPanel: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  private statsCanvas: HTMLCanvasElement | null = null
  onStats?: (text: string) => void
  grabStatus = 'Agarre v2'

  /** Opt-in small head-mounted display; the host may mirror its text on the page. */
  enableStats(): void {
    if (this.statsPanel) return
    this.statsCanvas = document.createElement('canvas')
    this.statsCanvas.width = 256
    this.statsCanvas.height = 80
    const texture = new THREE.CanvasTexture(this.statsCanvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.statsPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.05),
      new THREE.MeshBasicMaterial({
        map: texture,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    )
    this.statsPanel.position.set(0.12, 0.27, -1)
    this.statsPanel.renderOrder = 10000
    this.statsPanel.frustumCulled = false
    this.statsPanel.visible = this.active
    this.camera.add(this.statsPanel)
  }

  recordStats(time: number, cpu: number, physics: number, calls: number, triangles: number): void {
    if (!this.statsPanel || !this.statsCanvas) return
    const sample = this.stats.sample(time, cpu, physics, calls, triangles)
    const fps = sample?.match(/FPS app ([\d.]+)/)?.[1]
    if (!fps) return
    const text = `${fps} FPS`
    const context = this.statsCanvas.getContext('2d')!
    context.clearRect(0, 0, 256, 80)
    context.fillStyle = '#eefaff'
    context.font = '42px sans-serif'
    context.textAlign = 'center'
    context.fillText(text, 128, 55, 248)
    this.statsPanel.material.map!.needsUpdate = true
    this.onStats?.(text)
  }

  private exitButton: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  private terrainButton: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null
  private terrainCanvas: HTMLCanvasElement | null = null
  private terrainAction: (() => Promise<void>) | null = null
  private terrainBusy = false

  enableTerrainButton(action: () => Promise<void>): void {
    this.terrainAction = action
    if (this.terrainButton) return
    this.terrainCanvas = document.createElement('canvas')
    this.terrainCanvas.width = 128
    this.terrainCanvas.height = 128
    const texture = new THREE.CanvasTexture(this.terrainCanvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.terrainButton = new THREE.Mesh(
      new THREE.PlaneGeometry(0.065, 0.065),
      new THREE.MeshBasicMaterial({
        map: texture,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    )
    this.terrainButton.position.set(0.29, 0.27, -1)
    this.terrainButton.renderOrder = 10001
    this.terrainButton.frustumCulled = false
    this.terrainButton.visible = this.active
    this.camera.add(this.terrainButton)
    this.setTerrainStatus('Añadir Z15 cercano')
  }

  setTerrainStatus(text: string): void {
    if (!this.terrainCanvas || !this.terrainButton) return
    const context = this.terrainCanvas.getContext('2d')!
    this.terrainButton.userData.status = text
    context.clearRect(0, 0, 128, 128)
    context.fillStyle = 'white'
    context.font = '90px sans-serif'
    context.textAlign = 'center'
    context.fillText('+', 64, 96)
    this.terrainButton.material.map!.needsUpdate = true
  }

  private uiCaptured: XRInputSource | null = null
  private readonly exitRay = new THREE.Raycaster()

  /** Head-mounted exit target, selected with a tracked controller trigger. */
  enableExitButton(): void {
    if (this.exitButton) return
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')!
    context.fillStyle = 'white'
    context.font = '64px sans-serif'
    context.textAlign = 'center'
    context.fillText('X', 64, 88)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    this.exitButton = new THREE.Mesh(
      new THREE.PlaneGeometry(0.065, 0.065),
      new THREE.MeshBasicMaterial({
        map: texture,
        depthTest: false,
        depthWrite: false,
        transparent: true,
      }),
    )
    this.exitButton.position.set(0.4, 0.27, -1)
    this.exitButton.renderOrder = 10001
    this.exitButton.frustumCulled = false
    this.exitButton.visible = this.active
    this.camera.add(this.exitButton)
  }

  private aimsAtExit(aim: THREE.Object3D): boolean {
    return this.aimsAtButton(aim, this.exitButton)
  }

  private aimsAtButton(aim: THREE.Object3D, button: THREE.Object3D | null): boolean {
    if (!button?.visible) return false
    this.exitRay.ray.origin.copy(aim.getWorldPosition(new THREE.Vector3()))
    this.exitRay.ray.direction
      .set(0, 0, -1)
      .applyQuaternion(aim.getWorldQuaternion(new THREE.Quaternion()))
    button.updateWorldMatrix(true, false)
    return this.exitRay.intersectObject(button).length > 0
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
    return this.tracked.filter((source) => source !== this.uiCaptured)
  }
  get grabHands() {
    return this.hands.filter((hand) => !!hand.source && this.sources.includes(hand.source))
  }
  get rightHand() {
    return this.hands.find(
      (hand) =>
        hand.source?.handedness === 'right' &&
        hand.source !== this.uiCaptured &&
        this.tracked.includes(hand.source),
    )
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
        this.uiCaptured = null
        this.calibrationScreen?.suspend()
        if (this.settingsButton) this.settingsButton.visible = active
        if (this.exitButton) this.exitButton.visible = active
        if (this.terrainButton) this.terrainButton.visible = active
        if (this.statsPanel) this.statsPanel.visible = active
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
      aim.addEventListener('selectstart', () => {
        if (slot.source && this.reservedInput(slot.source)) return
        if (!this.active || !this.visible || !slot.source || !this.tracked.includes(slot.source))
          return
        if (!this.armedSources.has(slot.source) && this.aimsAtButton(aim, this.settingsButton)) {
          this.uiCaptured = slot.source
          this.showCalibrationScreen()
        } else if (this.aimsAtExit(aim)) {
          this.uiCaptured = slot.source
          void this.exit().catch((error) => {
            this.uiCaptured = null
            report(error)
          })
        } else if (this.aimsAtButton(aim, this.terrainButton)) {
          this.uiCaptured = slot.source
          if (this.terrainBusy || !this.terrainAction) return
          this.terrainBusy = true
          void this.terrainAction()
            .catch(report)
            .finally(() => {
              this.terrainBusy = false
            })
        }
      })
      aim.addEventListener('selectend', () => {
        if (this.uiCaptured === slot.source) this.uiCaptured = null
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
  enter(system: XRSystem = navigator.xr!): Promise<void> {
    if (!system) return Promise.reject(new Error('WebXR requiere HTTPS y un navegador compatible'))
    this.renderer.xr.setFramebufferScaleFactor(this.quality.scale)
    return this.session.enter(system)
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
    if (this.exitButton)
      this.exitButton.material.color.set(
        this.hands.some(
          (hand) =>
            !!hand.source && this.tracked.includes(hand.source) && this.aimsAtExit(hand.aim),
        )
          ? '#ffe19a'
          : '#ffffff',
      )
    if (this.terrainButton)
      this.terrainButton.material.color.set(
        this.hands.some(
          (hand) =>
            !!hand.source &&
            this.tracked.includes(hand.source) &&
            this.aimsAtButton(hand.aim, this.terrainButton),
        )
          ? '#ffe19a'
          : '#ffffff',
      )
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
    this.terrainButton?.removeFromParent()
    this.terrainButton?.geometry.dispose()
    this.terrainButton?.material.map?.dispose()
    this.terrainButton?.material.dispose()
    this.calibrationScreen?.dispose()
    this.settingsButton?.removeFromParent()
    this.settingsButton?.geometry.dispose()
    this.settingsButton?.material.map?.dispose()
    this.settingsButton?.material.dispose()
    this.exitButton?.removeFromParent()
    this.exitButton?.geometry.dispose()
    this.exitButton?.material.map?.dispose()
    this.exitButton?.material.dispose()
    this.statsPanel?.removeFromParent()
    this.statsPanel?.geometry.dispose()
    this.statsPanel?.material.map?.dispose()
    this.statsPanel?.material.dispose()
    for (const hand of this.hands) hand.visual.dispose()
    this.rig.removeFromParent()
  }
}
