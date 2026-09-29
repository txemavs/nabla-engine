/** Phase-1 design contract, type-checked by tests. NOT an exported/implemented engine API. */
export type Vec3 = readonly [number, number, number]
export interface Disposable {
  dispose(): void
}
export interface Lease<T> extends Disposable {
  readonly value: T
}
export interface TelemetrySample<T> {
  readonly tick: number
  readonly simulationSeconds: number
  readonly value: Readonly<T>
}
export interface TelemetrySource<T> {
  read(): TelemetrySample<T>
}
export interface FixedFrame {
  readonly dtSeconds: number
  readonly tick: number
  readonly simulationSeconds: number
}
export interface PresentationFrame {
  readonly dtSeconds: number
  readonly nowMs: number
  readonly originMetres: Vec3
  readonly visible: boolean
}
export interface Component extends Disposable {
  /** Host may cancel loading. Failed/late loads release their leases. */
  prepare(signal: AbortSignal): Promise<void>
  setActive(active: boolean): void
}
export interface PhysicsComponent extends Component {
  fixedUpdate(frame: FixedFrame): void
}
export interface VisualComponent extends Component {
  update(frame: PresentationFrame): void
}
export interface Mount<Pose, Surface> {
  readonly id: string
  readonly localPose: Pose
  attach(surface: Surface): Disposable
}
export interface WheelContact {
  readonly wheelId: string
  readonly positionWorldMetres: Vec3 | null
  readonly normalWorld: Vec3 | null
  readonly slip01: number
  readonly groundEntityId: string | null
}
export interface VehicleTelemetry {
  readonly speedMetresPerSecond: number
  readonly gear: number
  readonly rpm: number
  readonly contacts: readonly WheelContact[]
}
export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue }
export interface PropertySpec {
  readonly key: string
  readonly label: string
  readonly unit: string
  readonly defaultValue: JsonValue
  readonly minimum?: number
  readonly maximum?: number
  readonly step?: number
  readonly persistence: 'scene' | 'session'
}
export interface PropertyAction {
  readonly type: 'property.set'
  readonly targetId: string
  readonly key: string
  readonly value: JsonValue
}
export interface ActionResult {
  readonly applied: boolean
  readonly reason?: string
}
export interface ActionHost {
  dispatch(action: PropertyAction): ActionResult
}
export interface RefreshPolicy {
  readonly intervalMs: number
  readonly priority: 'primary' | 'secondary'
  readonly inactive: 'stop'
}
