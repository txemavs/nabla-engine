import { Quaternion, Vector3 } from 'three'
import { ecef, localFrame, type GeoPoint } from '../math/geo/sphere.js'
import type { Vec3Tuple, QuatTuple } from '../math/frame/vectors.js'
import type { AvatarBlock, EntityState, NetEventData } from './protocol.js'

/** A content version and coordinate contract shared by every client of an instance. */
export type ContinuousWorldOptions = {
  content: string
  /** Reuse this object across reconnects/recreated sync instances. Tokens are bearer secrets. */
  session?: WorldSession
} & ({ space: 'local' } | { space: 'planet'; origin: GeoPoint })

export interface WorldSession {
  token?: string
}

/** Optional per-tab token storage; key MUST include relay URL, instance id and content version. */
export function browserWorldSession(key: string): WorldSession {
  let memory: string | undefined
  return {
    get token() {
      try {
        return globalThis.sessionStorage.getItem(`nabla-world:${key}`) ?? memory
      } catch {
        return memory
      }
    },
    set token(value: string | undefined) {
      memory = value
      try {
        if (value) globalThis.sessionStorage.setItem(`nabla-world:${key}`, value)
        else globalThis.sessionStorage.removeItem(`nabla-world:${key}`)
      } catch {
        /* Storage is optional. */
      }
    },
  }
}

/** Planet wire space is the engine's spherical ECEF (+Y north, -Z at 90°E), in metres. */
export class WorldSpace {
  private readonly center: Vector3
  private readonly frame: Quaternion
  private readonly inverse: Quaternion
  constructor(readonly options: ContinuousWorldOptions) {
    if (!/^[A-Za-z0-9_.:-]{1,64}$/.test(options.content))
      throw new Error('Invalid world content id')
    if (options.space === 'planet') {
      const p = options.origin
      if (
        !Number.isFinite(p.latitude) ||
        Math.abs(p.latitude) > 90 ||
        !Number.isFinite(p.longitude) ||
        Math.abs(p.longitude) > 180 ||
        !Number.isFinite(p.altitude)
      )
        throw new Error('Invalid planetary origin')
      this.center = ecef(p)
      this.frame = localFrame(p)
    } else {
      this.center = new Vector3()
      this.frame = new Quaternion()
    }
    this.inverse = this.frame.clone().invert()
  }
  point(p: readonly number[], incoming = false): Vec3Tuple {
    const v = new Vector3(p[0], p[1], p[2])
    return (
      incoming
        ? v.sub(this.center).applyQuaternion(this.inverse)
        : v.applyQuaternion(this.frame).add(this.center)
    ).toArray()
  }
  direction(v: readonly number[], incoming = false): Vec3Tuple {
    return new Vector3(v[0], v[1], v[2])
      .applyQuaternion(incoming ? this.inverse : this.frame)
      .toArray()
  }
  rotation(q: readonly number[], incoming = false): QuatTuple {
    return new Quaternion(q[0], q[1], q[2], q[3])
      .premultiply(incoming ? this.inverse : this.frame)
      .normalize()
      .toArray()
  }
  state(s: EntityState, incoming = false): EntityState {
    return {
      ...s,
      position: this.point(s.position, incoming),
      rotation: this.rotation(s.rotation, incoming),
      velocity: this.direction(s.velocity, incoming),
      angularVelocity: this.direction(s.angularVelocity, incoming),
    }
  }
  avatar(a: AvatarBlock, incoming = false): AvatarBlock {
    if (this.options.space === 'local') return { ...a }
    const out = { ...a, p: this.point(a.p, incoming) }
    if (incoming) {
      if (!a.q) throw new Error('Planet avatar lacks orientation')
      const forward = new Vector3(0, 0, -1).applyQuaternion(
        new Quaternion(...this.rotation(a.q, true)),
      )
      out.y = Math.atan2(-forward.x, -forward.z)
      if (a.u) {
        const direction = this.direction(a.u, true)
        out.v = [
          Math.atan2(-direction[0], -direction[2]),
          Math.asin(Math.max(-1, Math.min(1, direction[1]))),
        ]
      }
      delete out.q
      delete out.u
    } else {
      out.q = this.rotation(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), a.y).toArray())
      if (a.v)
        out.u = this.direction([
          -Math.sin(a.v[0]) * Math.cos(a.v[1]),
          Math.sin(a.v[1]),
          -Math.cos(a.v[0]) * Math.cos(a.v[1]),
        ])
    }
    return out
  }
  event(kind: string, data: NetEventData, incoming = false): NetEventData {
    const out = { ...data }
    const point = (key: string) => {
      if (Array.isArray(data[key]) && data[key].length === 3)
        out[key] = this.point(data[key], incoming)
    }
    const direction = (key: string) => {
      if (Array.isArray(data[key]) && data[key].length === 3)
        out[key] = this.direction(data[key], incoming)
    }
    if (['entity', 'entity.spawn', 'entity.release'].includes(kind)) {
      point('p')
      if (Array.isArray(data.q) && data.q.length === 4) out.q = this.rotation(data.q, incoming)
    } else if (kind === 'fire') {
      point('o')
      direction('d')
    } else if (['hit', 'health', 'death', 'respawn'].includes(kind)) {
      point('o')
      point('p')
      direction('r')
    }
    return out
  }
}
