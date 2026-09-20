/**
 * SceneNode — hierarchical transform node for scene graph.
 *
 * ## Coordinate System (glTF/Blender standard)
 * - Right-handed, Y-up, metres
 * - +X right, +Y up, -Z forward
 *
 * ## Transform Order
 * Local transform: Translation × Rotation(YXZ) × Scale
 * World transform: parent.world × local
 *
 * Children inherit parent's world transform. Attach/detach preserves
 * world position (adjusts local to compensate).
 */

export interface Transform {
  x: number
  y: number
  z: number
  yaw: number    // degrees, rotation around Y
  pitch: number  // degrees, rotation around X
  roll: number   // degrees, rotation around Z
  sx: number     // scale X
  sy: number     // scale Y
  sz: number     // scale Z
}

export interface WorldPose {
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  roll: number
}

export function identityTransform(): Transform {
  return { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, sx: 1, sy: 1, sz: 1 }
}

export function poseToTransform(pose: Partial<WorldPose>): Transform {
  return {
    x: pose.x ?? 0,
    y: pose.y ?? 0,
    z: pose.z ?? 0,
    yaw: pose.yaw ?? 0,
    pitch: pose.pitch ?? 0,
    roll: pose.roll ?? 0,
    sx: 1,
    sy: 1,
    sz: 1,
  }
}

/**
 * 4x4 matrix in column-major order (WebGL convention).
 */
export type Mat4 = Float32Array

export function identityMat4(): Mat4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ])
}

/**
 * Build a 4x4 transform matrix from position and Euler angles (YXZ order).
 */
export function transformToMat4(t: Transform): Mat4 {
  const cy = Math.cos(t.yaw * Math.PI / 180), sy = Math.sin(t.yaw * Math.PI / 180)
  const cp = Math.cos(t.pitch * Math.PI / 180), sp = Math.sin(t.pitch * Math.PI / 180)
  const cr = Math.cos(t.roll * Math.PI / 180), sr = Math.sin(t.roll * Math.PI / 180)

  // Rotation matrix: R = Ry * Rx * Rz (YXZ order)
  const m00 = (cy * cr + sy * sp * sr) * t.sx
  const m01 = (cp * sr) * t.sy
  const m02 = (-sy * cr + cy * sp * sr) * t.sz
  const m10 = (cy * -sr + sy * sp * cr) * t.sx
  const m11 = (cp * cr) * t.sy
  const m12 = (sy * sr + cy * sp * cr) * t.sz
  const m20 = (sy * cp) * t.sx
  const m21 = (-sp) * t.sy
  const m22 = (cy * cp) * t.sz

  return new Float32Array([
    m00, m10, m20, 0,
    m01, m11, m21, 0,
    m02, m12, m22, 0,
    t.x, t.y, t.z, 1,
  ])
}

/**
 * Multiply two 4x4 matrices: result = a × b
 */
export function mulMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3]
    }
  }
  return out
}

/**
 * Extract position from a 4x4 matrix.
 */
export function mat4Position(m: Mat4): { x: number; y: number; z: number } {
  return { x: m[12], y: m[13], z: m[14] }
}

/**
 * Extract Euler angles (YXZ) from a 4x4 rotation matrix.
 * Assumes no scale or uniform scale.
 */
export function mat4ToEuler(m: Mat4): { yaw: number; pitch: number; roll: number } {
  // Extract rotation matrix (ignore scale for now)
  const m00 = m[0], m20 = m[2]
  const m01 = m[4], m11 = m[5], m21 = m[6]
  const m22 = m[10]

  // YXZ Euler extraction
  const pitch = Math.asin(-Math.max(-1, Math.min(1, m21)))
  let yaw: number, roll: number

  if (Math.abs(m21) < 0.9999) {
    yaw = Math.atan2(m20, m22)
    roll = Math.atan2(m01, m11)
  } else {
    yaw = Math.atan2(-m[8], m00)
    roll = 0
  }

  return {
    yaw: yaw * 180 / Math.PI,
    pitch: pitch * 180 / Math.PI,
    roll: roll * 180 / Math.PI,
  }
}

/**
 * Invert a 4x4 matrix (assumes affine transform).
 */
export function invertMat4(m: Mat4): Mat4 {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3]
  const a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7]
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11]
  const a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15]

  const b00 = a00 * a11 - a01 * a10
  const b01 = a00 * a12 - a02 * a10
  const b02 = a00 * a13 - a03 * a10
  const b03 = a01 * a12 - a02 * a11
  const b04 = a01 * a13 - a03 * a11
  const b05 = a02 * a13 - a03 * a12
  const b06 = a20 * a31 - a21 * a30
  const b07 = a20 * a32 - a22 * a30
  const b08 = a20 * a33 - a23 * a30
  const b09 = a21 * a32 - a22 * a31
  const b10 = a21 * a33 - a23 * a31
  const b11 = a22 * a33 - a23 * a32

  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
  if (Math.abs(det) < 1e-10) {
    return identityMat4()
  }
  det = 1.0 / det

  return new Float32Array([
    (a11 * b11 - a12 * b10 + a13 * b09) * det,
    (a02 * b10 - a01 * b11 - a03 * b09) * det,
    (a31 * b05 - a32 * b04 + a33 * b03) * det,
    (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det,
    (a00 * b11 - a02 * b08 + a03 * b07) * det,
    (a32 * b02 - a30 * b05 - a33 * b01) * det,
    (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det,
    (a01 * b08 - a00 * b10 - a03 * b06) * det,
    (a30 * b04 - a31 * b02 + a33 * b00) * det,
    (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det,
    (a00 * b09 - a01 * b07 + a02 * b06) * det,
    (a31 * b01 - a30 * b03 - a32 * b00) * det,
    (a20 * b03 - a21 * b01 + a22 * b00) * det,
  ])
}

let nextNodeId = 1

export class SceneNode {
  readonly id: number
  name: string
  local: Transform
  private _parent: SceneNode | null = null
  private _children: SceneNode[] = []
  private _worldMatrix: Mat4 = identityMat4()
  private _worldDirty = true
  visible = true
  
  /** Optional mesh data for rendering */
  mesh: {
    positions: Float32Array
    normals: Float32Array
    indices: Uint16Array
    uvs?: Float32Array
    color?: [number, number, number]
  } | null = null

  constructor(name = 'node') {
    this.id = nextNodeId++
    this.name = name
    this.local = identityTransform()
  }

  get parent(): SceneNode | null {
    return this._parent
  }

  get children(): readonly SceneNode[] {
    return this._children
  }

  get worldMatrix(): Mat4 {
    if (this._worldDirty) {
      this._updateWorldMatrix()
    }
    return this._worldMatrix
  }

  get worldPosition(): { x: number; y: number; z: number } {
    return mat4Position(this.worldMatrix)
  }

  get worldPose(): WorldPose {
    const m = this.worldMatrix
    const pos = mat4Position(m)
    const euler = mat4ToEuler(m)
    return { ...pos, ...euler }
  }

  setLocal(pose: Partial<Transform>): void {
    if (pose.x !== undefined) this.local.x = pose.x
    if (pose.y !== undefined) this.local.y = pose.y
    if (pose.z !== undefined) this.local.z = pose.z
    if (pose.yaw !== undefined) this.local.yaw = pose.yaw
    if (pose.pitch !== undefined) this.local.pitch = pose.pitch
    if (pose.roll !== undefined) this.local.roll = pose.roll
    if (pose.sx !== undefined) this.local.sx = pose.sx
    if (pose.sy !== undefined) this.local.sy = pose.sy
    if (pose.sz !== undefined) this.local.sz = pose.sz
    this._markDirty()
  }

  setWorldPose(pose: Partial<WorldPose>): void {
    if (this._parent) {
      // Convert world pose to local by applying inverse of parent's world
      const parentInv = invertMat4(this._parent.worldMatrix)
      const worldT: Transform = {
        x: pose.x ?? this.worldPosition.x,
        y: pose.y ?? this.worldPosition.y,
        z: pose.z ?? this.worldPosition.z,
        yaw: pose.yaw ?? this.worldPose.yaw,
        pitch: pose.pitch ?? this.worldPose.pitch,
        roll: pose.roll ?? this.worldPose.roll,
        sx: this.local.sx,
        sy: this.local.sy,
        sz: this.local.sz,
      }
      const worldMat = transformToMat4(worldT)
      const localMat = mulMat4(parentInv, worldMat)
      const localPos = mat4Position(localMat)
      const localEuler = mat4ToEuler(localMat)
      this.local.x = localPos.x
      this.local.y = localPos.y
      this.local.z = localPos.z
      this.local.yaw = localEuler.yaw
      this.local.pitch = localEuler.pitch
      this.local.roll = localEuler.roll
    } else {
      if (pose.x !== undefined) this.local.x = pose.x
      if (pose.y !== undefined) this.local.y = pose.y
      if (pose.z !== undefined) this.local.z = pose.z
      if (pose.yaw !== undefined) this.local.yaw = pose.yaw
      if (pose.pitch !== undefined) this.local.pitch = pose.pitch
      if (pose.roll !== undefined) this.local.roll = pose.roll
    }
    this._markDirty()
  }

  /**
   * Attach a child node. Preserves the child's world position
   * by adjusting its local transform.
   */
  attach(child: SceneNode): void {
    if (child._parent === this) return
    if (child._parent) {
      child._parent.detach(child)
    }
    
    // Preserve world position
    const childWorld = child.worldPose
    child._parent = this
    this._children.push(child)
    child.setWorldPose(childWorld)
  }

  /**
   * Detach a child node. Preserves the child's world position.
   */
  detach(child: SceneNode): void {
    const idx = this._children.indexOf(child)
    if (idx === -1) return
    
    // Preserve world position
    const childWorld = child.worldPose
    child._parent = null
    this._children.splice(idx, 1)
    child.setWorldPose(childWorld)
  }

  /**
   * Find a descendant node by name.
   */
  find(name: string): SceneNode | null {
    if (this.name === name) return this
    for (const c of this._children) {
      const found = c.find(name)
      if (found) return found
    }
    return null
  }

  /**
   * Traverse all nodes depth-first.
   */
  traverse(callback: (node: SceneNode) => void): void {
    callback(this)
    for (const c of this._children) {
      c.traverse(callback)
    }
  }

  private _markDirty(): void {
    this._worldDirty = true
    for (const c of this._children) {
      c._markDirty()
    }
  }

  private _updateWorldMatrix(): void {
    const localMat = transformToMat4(this.local)
    if (this._parent) {
      this._worldMatrix = mulMat4(this._parent.worldMatrix, localMat)
    } else {
      this._worldMatrix = localMat
    }
    this._worldDirty = false
  }
}

/**
 * Build debug lines for a scene graph (RGB axes + parent-child connections).
 */
export interface DebugLine {
  x1: number; y1: number; z1: number
  x2: number; y2: number; z2: number
  r: number; g: number; b: number
}

export function sceneDebugLines(root: SceneNode, axisLen = 0.5): DebugLine[] {
  const lines: DebugLine[] = []
  
  root.traverse((node) => {
    if (!node.visible) return
    
    const w = node.worldMatrix
    const ox = w[12], oy = w[13], oz = w[14]
    
    // Local axes (transformed)
    // X axis (red)
    lines.push({
      x1: ox, y1: oy, z1: oz,
      x2: ox + w[0] * axisLen, y2: oy + w[1] * axisLen, z2: oz + w[2] * axisLen,
      r: 1, g: 0, b: 0,
    })
    // Y axis (green)
    lines.push({
      x1: ox, y1: oy, z1: oz,
      x2: ox + w[4] * axisLen, y2: oy + w[5] * axisLen, z2: oz + w[6] * axisLen,
      r: 0, g: 1, b: 0,
    })
    // Z axis (blue)
    lines.push({
      x1: ox, y1: oy, z1: oz,
      x2: ox + w[8] * axisLen, y2: oy + w[9] * axisLen, z2: oz + w[10] * axisLen,
      r: 0, g: 0, b: 1,
    })
    
    // Parent-child connection (cyan)
    if (node.parent) {
      const pw = node.parent.worldMatrix
      lines.push({
        x1: pw[12], y1: pw[13], z1: pw[14],
        x2: ox, y2: oy, z2: oz,
        r: 0, g: 1, b: 1,
      })
    }
  })
  
  return lines
}
