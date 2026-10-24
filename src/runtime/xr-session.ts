import { createSettingsStore, type SettingsStorage } from './settings-scope.js'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'

/** Host-owned session lifecycle. Rendering uses one setAnimationLoop in both modes. */
export class XRSessionController {
  private session: XRSession | null = null
  private floor: XRReferenceSpace | null = null
  private unbounded: XRReferenceSpace | null = null
  private originOffset: Matrix4 | null = null
  private worldAnchor: XRAnchor | null = null
  private anchorRequested = false
  private anchorTracked = true
  private poseTracked = false
  diagnosticsEnabled = false
  private diagnosticEvents: { at: string; type: string; data: unknown }[] = []
  private lastDiagnosticSample = -Infinity
  private anchorError: string | null = null
  /** Bounded, explicit diagnostics. Never changes tracking, anchoring or reference transforms. */
  recordDiagnostic(type: string, data: unknown = {}): void {
    this.diagnosticEvents.push({
      at: new Date().toISOString(),
      type,
      data: JSON.parse(JSON.stringify(data)),
    })
    if (this.diagnosticEvents.length > 256) this.diagnosticEvents.shift()
    if (this.diagnosticsEnabled) {
      try {
        this.storage.setItem('nabla.xr.tracking-report.v1', this.exportDiagnostics())
      } catch {
        /* Memory copy stays available. */
      }
    }
  }
  startDiagnostics(): void {
    this.diagnosticsEnabled = true
    this.recordDiagnostic('test-start', this.diagnosticState())
  }
  private diagnosticState() {
    return {
      active: this.active,
      referenceReady: this.referenceReady,
      referenceSpace: this.referenceSpaceType,
      visibility: this.session?.visibilityState,
      anchorCreated: !!this.worldAnchor,
      anchorRequested: this.anchorRequested,
      anchorTracked: this.anchorTracked,
      anchorError: this.anchorError,
      origin: this.originOffset?.toArray() ?? null,
    }
  }
  exportDiagnostics(): string {
    return JSON.stringify(
      {
        version: 1,
        capturedAt: new Date().toISOString(),
        state: this.diagnosticState(),
        userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
        events: this.diagnosticEvents,
      },
      null,
      2,
    )
  }
  private readonly visibilityChanged = (): void => {
    this.recordDiagnostic('visibility-change', this.diagnosticState())
  }
  /** True once the initial tracking origin has been aligned to the real floor. */
  get referenceReady(): boolean {
    return (
      this.poseTracked &&
      !this.centerRequested &&
      !!this.floor &&
      (!this.worldAnchor || this.anchorTracked)
    )
  }
  get referenceSpaceType(): 'unbounded' | 'local-floor' {
    return this.unbounded ? 'unbounded' : 'local-floor'
  }
  private pending = false
  private closed = false
  private centerRequested = false

  constructor(
    private readonly xr: {
      setSession(session: XRSession | null): Promise<void>
      setReferenceSpace(space: XRReferenceSpace): void
      setReferenceSpaceType?(type: XRReferenceSpaceType): void
    },
    private readonly changed: (active: boolean) => void,
    private readonly report: (error: unknown) => void,
    private readonly storage: SettingsStorage = createSettingsStore(),
  ) {
    try {
      const saved = JSON.parse(this.storage.getItem('nabla.xr.tracking-report.v1') ?? '{}')
      if (Array.isArray(saved.events))
        this.diagnosticEvents = saved.events
          .filter(
            (event: { at?: unknown; type?: unknown }) =>
              typeof event?.at === 'string' && typeof event?.type === 'string',
          )
          .slice(-256)
    } catch {
      /* Diagnostics must never block XR entry. */
    }
  }

  get active(): boolean {
    return this.session !== null
  }

  /** Call directly from a user gesture; never await feature detection before requesting. */
  async enter(
    system: XRSystem,
    mode: 'immersive-vr' | 'immersive-ar' = 'immersive-vr',
    handTracking = false,
    domOverlayRoot?: HTMLElement,
  ): Promise<void> {
    if (this.pending || this.session || this.closed) return
    this.pending = true
    let session: XRSession | undefined
    try {
      session = await system.requestSession(mode, {
        requiredFeatures: mode === 'immersive-ar' ? ['unbounded', 'local-floor'] : ['local-floor'],
        ...(mode === 'immersive-ar' || handTracking
          ? {
              ...(domOverlayRoot ? { domOverlay: { root: domOverlayRoot } } : {}),
              optionalFeatures: [
                ...(domOverlayRoot ? ['dom-overlay'] : []),
                ...(mode === 'immersive-ar'
                  ? ['plane-detection', 'mesh-detection', 'anchors']
                  : []),
                ...(handTracking ? ['hand-tracking'] : []),
              ],
            }
          : {}),
      })
      if (this.closed) {
        await session.end()
        return
      }
      this.session = session
      this.anchorError = null
      this.recordDiagnostic('session-entered', {
        mode,
        enabledFeatures:
          (session as XRSession & { enabledFeatures?: readonly string[] }).enabledFeatures ?? [],
      })
      session.addEventListener('visibilitychange', this.visibilityChanged)
      session.addEventListener('end', this.ended)
      this.floor = await session.requestReferenceSpace('local-floor')
      if (this.session !== session || this.closed) return
      this.floor.addEventListener('reset', this.floorReset)
      if (mode === 'immersive-ar') {
        this.unbounded = await session.requestReferenceSpace('unbounded')
        if (this.session !== session || this.closed) return
        this.unbounded.addEventListener('reset', this.trackingReset)
      }
      this.xr.setReferenceSpaceType?.(this.referenceSpaceType)
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
    // In AR, content belongs to the room. A head recenter must not redefine it.
    if (this.unbounded && this.originOffset) return
    this.centerRequested = true
  }

  // local-floor is only a height reference in AR. Its reset must not move the
  // unbounded world, or compensate the same system reset twice.
  private readonly floorReset = (event: XRReferenceSpaceEvent): void => {
    this.recordDiagnostic('floor-reset', {
      transform: event.transform?.matrix ? Array.from(event.transform.matrix) : null,
      ignoredForAR: !!this.unbounded,
    })
    if (!this.unbounded) this.trackingReset(event)
  }

  private readonly trackingReset = (event: XRReferenceSpaceEvent): void => {
    this.recordDiagnostic('tracking-reset', {
      transform: event.transform?.matrix ? Array.from(event.transform.matrix) : null,
      ...this.diagnosticState(),
    })
    if (!this.originOffset) return // Initial alignment still needs its first pose.
    if (!event.transform) {
      if (this.worldAnchor) {
        this.anchorTracked = false
        return // The next tracked anchor pose restores the physical origin.
      }
      this.report(
        new Error(
          'XR cambió el origen sin indicar su transformación; no se puede garantizar la posición de los objetos. Sal y vuelve a entrar si se han desplazado.',
        ),
      )
      return
    }
    // WebXR gives the NEW native origin in OLD coordinates. Keep our world
    // physically fixed: newOriginOffset = inverse(reset) * oldOriginOffset.
    this.originOffset.premultiply(new Matrix4().fromArray(event.transform.matrix).invert())
    this.installOrigin()
    this.recordDiagnostic('tracking-reset-applied', this.diagnosticState())
  }

  private installOrigin(): void {
    const tracking = this.unbounded ?? this.floor
    if (!tracking || !this.originOffset) return
    const position = new Vector3(),
      rotation = new Quaternion()
    this.originOffset.decompose(position, rotation, new Vector3())
    this.xr.setReferenceSpace(
      tracking.getOffsetReferenceSpace(new XRRigidTransform(position, rotation)),
    )
  }

  /** Preserve floor height; only horizontal position and yaw are recentered. */
  update(frame: XRFrame): void {
    if (!this.floor) return
    if (this.session?.visibilityState && this.session.visibilityState !== 'visible') {
      this.poseTracked = false
      return
    }
    const tracking = this.unbounded ?? this.floor
    const pose = frame.getViewerPose(tracking)
    const wasTracked = this.poseTracked
    this.poseTracked = !!pose && !pose.emulatedPosition
    if (wasTracked !== this.poseTracked)
      this.recordDiagnostic('viewer-tracking', {
        tracked: this.poseTracked,
        emulated: pose?.emulatedPosition ?? null,
      })
    const now = performance.now()
    if (this.diagnosticsEnabled && now - this.lastDiagnosticSample >= 1000) {
      this.lastDiagnosticSample = now
      this.recordDiagnostic('tracking-sample', {
        viewer: pose
          ? {
              position: pose.transform.position,
              orientation: pose.transform.orientation,
              emulated: pose.emulatedPosition,
            }
          : null,
        ...this.diagnosticState(),
      })
    }
    if (!this.poseTracked || !pose) return
    if (!this.centerRequested) {
      this.updateWorldAnchor(frame, tracking)
      return
    }
    // Unbounded has no guaranteed floor height. Measure local-floor in that space,
    // then keep the actual render/reference space unbounded for every scene consumer.
    const floorPose = this.unbounded ? frame.getPose(this.floor, this.unbounded) : null
    if (this.unbounded && (!floorPose || floorPose.emulatedPosition)) return
    const floorY = floorPose?.transform.position.y ?? 0
    const { position, orientation } = pose.transform
    const yaw = new Euler().setFromQuaternion(
      new Quaternion(orientation.x, orientation.y, orientation.z, orientation.w),
      'YXZ',
    ).y
    const rotation = new Quaternion().setFromEuler(new Euler(0, yaw, 0))
    this.originOffset = new Matrix4().compose(
      new Vector3(position.x, floorY, position.z),
      rotation,
      new Vector3(1, 1, 1),
    )
    this.installOrigin()
    this.centerRequested = false
    this.recordDiagnostic('floor-aligned', {
      floor: floorPose?.transform.position,
      ...this.diagnosticState(),
    })
    this.updateWorldAnchor(frame, tracking)
  }

  /** One physical room origin keeps every renderer and physics consumer in the same frame. */
  private updateWorldAnchor(frame: XRFrame, tracking: XRReferenceSpace): void {
    if (!this.unbounded || !this.originOffset) return
    if (this.worldAnchor) {
      const tracked = !frame.trackedAnchors || frame.trackedAnchors.has(this.worldAnchor)
      const pose = tracked ? frame.getPose(this.worldAnchor.anchorSpace, tracking) : null
      const wasTracked = this.anchorTracked
      this.anchorTracked = !!pose && !pose.emulatedPosition
      if (wasTracked !== this.anchorTracked)
        this.recordDiagnostic('anchor-tracking', {
          tracked: this.anchorTracked,
          pose: pose?.transform.matrix ? Array.from(pose.transform.matrix) : null,
        })
      if (!this.anchorTracked || !pose) return
      const next = new Matrix4().fromArray(pose.transform.matrix)
      if (next.elements.some((value) => !Number.isFinite(value))) {
        this.anchorTracked = false
        return
      }
      if (
        next.elements.some((value, i) => Math.abs(value - this.originOffset!.elements[i]) > 1e-7)
      ) {
        const before = new Vector3().setFromMatrixPosition(this.originOffset)
        const after = new Vector3().setFromMatrixPosition(next)
        const rotationBefore = new Quaternion().setFromRotationMatrix(this.originOffset)
        const rotationAfter = new Quaternion().setFromRotationMatrix(next)
        if (
          this.diagnosticsEnabled &&
          (before.distanceTo(after) > 0.01 || rotationBefore.angleTo(rotationAfter) > 0.01)
        )
          this.recordDiagnostic('anchor-origin-change', {
            before: this.originOffset.toArray(),
            after: next.toArray(),
          })
        this.originOffset.copy(next)
        this.installOrigin()
      }
      return
    }
    if (this.anchorRequested || !frame.createAnchor) return
    this.anchorRequested = true
    this.recordDiagnostic('anchor-request', this.diagnosticState())
    const session = this.session
    const position = new Vector3(),
      rotation = new Quaternion()
    this.originOffset.decompose(position, rotation, new Vector3())
    try {
      void frame
        .createAnchor(new XRRigidTransform(position, rotation), tracking)
        .then((anchor) => {
          if (this.session !== session || this.closed) anchor.delete()
          else {
            this.worldAnchor = anchor
            this.recordDiagnostic('anchor-created', this.diagnosticState())
          }
        })
        .catch((error: unknown) => {
          this.anchorError =
            error instanceof Error ? `${error.name}: ${error.message}` : String(error)
          this.recordDiagnostic('anchor-failed', { error: this.anchorError })
        })
    } catch (error) {
      this.anchorError = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      this.recordDiagnostic('anchor-failed', { error: this.anchorError })
    }
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
    this.recordDiagnostic('session-ended', this.diagnosticState())
    this.session?.removeEventListener('visibilitychange', this.visibilityChanged)
    this.session?.removeEventListener('end', this.ended)
    this.floor?.removeEventListener('reset', this.floorReset)
    this.unbounded?.removeEventListener('reset', this.trackingReset)
    this.worldAnchor?.delete()
    this.worldAnchor = null
    this.anchorRequested = false
    this.anchorTracked = true
    this.poseTracked = false
    this.session = null
    this.floor = null
    this.unbounded = null
    this.originOffset = null
    this.centerRequested = false
    this.changed(false)
  }
}
