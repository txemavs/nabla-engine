/**
 * Minimal WebGL renderer for the drive playground.
 *
 * Renders:
 * - Textured ground plane
 * - Box meshes for vehicles (car body, wheels, ship hull)
 * - Simple debug lines
 */

export interface BoxMesh {
  x: number
  y: number
  z: number
  hx: number
  hy: number
  hz: number
  yaw: number
  pitch?: number
  roll?: number
  color: [number, number, number]
}

export interface Camera {
  x: number
  y: number
  z: number
  rx: number
  ry: number
}

const VS_BOX = `
  attribute vec3 aPos;
  attribute vec3 aNorm;
  uniform mat4 uProj;
  uniform mat4 uView;
  uniform mat4 uModel;
  varying vec3 vNorm;
  void main() {
    vNorm = mat3(uModel) * aNorm;
    gl_Position = uProj * uView * uModel * vec4(aPos, 1.0);
  }
`

const FS_BOX = `
  precision mediump float;
  uniform vec3 uColor;
  varying vec3 vNorm;
  void main() {
    vec3 light = normalize(vec3(0.3, 1.0, 0.5));
    float diff = max(dot(normalize(vNorm), light), 0.0) * 0.6 + 0.4;
    gl_FragColor = vec4(uColor * diff, 1.0);
  }
`

const VS_GROUND = `
  attribute vec3 aPos;
  attribute vec2 aUv;
  uniform mat4 uProj;
  uniform mat4 uView;
  varying vec2 vUv;
  void main() {
    vUv = aUv;
    gl_Position = uProj * uView * vec4(aPos, 1.0);
  }
`

const FS_GROUND = `
  precision mediump float;
  uniform sampler2D uTex;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(uTex, vUv);
  }
`

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, source)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(s))
  }
  return s
}

function createProgram(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, createShader(gl, gl.VERTEX_SHADER, vs))
  gl.attachShader(p, createShader(gl, gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(p))
  }
  return p
}

function perspective(fov: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fov / 2)
  const nf = 1 / (near - far)
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ])
}

function lookAt(ex: number, ey: number, ez: number, rx: number, ry: number): Float32Array {
  const radX = rx * Math.PI / 180
  const radY = ry * Math.PI / 180
  const cy = Math.cos(radY), sy = Math.sin(radY)
  const cx = Math.cos(radX), sx = Math.sin(radX)
  const fx = -sy * cx, fy = sx, fz = -cy * cx
  const ux = 0, uy = cx, uz = 0
  let rx2 = uy * fz - uz * fy, ry2 = uz * fx - ux * fz, rz2 = ux * fy - uy * fx
  const rlen = Math.hypot(rx2, ry2, rz2) || 1
  rx2 /= rlen; ry2 /= rlen; rz2 /= rlen
  const ux2 = fy * rz2 - fz * ry2, uy2 = fz * rx2 - fx * rz2, uz2 = fx * ry2 - fy * rx2
  return new Float32Array([
    rx2, ux2, -fx, 0,
    ry2, uy2, -fy, 0,
    rz2, uz2, -fz, 0,
    -(rx2*ex + ry2*ey + rz2*ez),
    -(ux2*ex + uy2*ey + uz2*ez),
    -(-fx*ex + -fy*ey + -fz*ez),
    1,
  ])
}

function modelMatrix(
  x: number, y: number, z: number,
  hx: number, hy: number, hz: number,
  yaw: number, pitch = 0, roll = 0,
): Float32Array {
  const cy = Math.cos(yaw * Math.PI / 180), sy = Math.sin(yaw * Math.PI / 180)
  const cp = Math.cos(pitch * Math.PI / 180), sp = Math.sin(pitch * Math.PI / 180)
  const cr = Math.cos(roll * Math.PI / 180), sr = Math.sin(roll * Math.PI / 180)
  const m00 = cy * cp * hx
  const m01 = (cy * sp * sr - sy * cr) * hy
  const m02 = (cy * sp * cr + sy * sr) * hz
  const m10 = sy * cp * hx
  const m11 = (sy * sp * sr + cy * cr) * hy
  const m12 = (sy * sp * cr - cy * sr) * hz
  const m20 = -sp * hx
  const m21 = cp * sr * hy
  const m22 = cp * cr * hz
  return new Float32Array([
    m00, m10, m20, 0,
    m01, m11, m21, 0,
    m02, m12, m22, 0,
    x, y, z, 1,
  ])
}

export class Renderer {
  private gl: WebGLRenderingContext
  private boxProg: WebGLProgram
  private groundProg: WebGLProgram
  private cubeVbo: WebGLBuffer
  private groundVbo: WebGLBuffer
  private groundTex: WebGLTexture
  private boxLocs: { aPos: number; aNorm: number; uProj: WebGLUniformLocation; uView: WebGLUniformLocation; uModel: WebGLUniformLocation; uColor: WebGLUniformLocation }
  private groundLocs: { aPos: number; aUv: number; uProj: WebGLUniformLocation; uView: WebGLUniformLocation; uTex: WebGLUniformLocation }
  private groundSize = 100

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl', { antialias: true })!
    this.gl = gl
    gl.enable(gl.DEPTH_TEST)
    gl.enable(gl.CULL_FACE)

    this.boxProg = createProgram(gl, VS_BOX, FS_BOX)
    this.groundProg = createProgram(gl, VS_GROUND, FS_GROUND)

    this.boxLocs = {
      aPos: gl.getAttribLocation(this.boxProg, 'aPos'),
      aNorm: gl.getAttribLocation(this.boxProg, 'aNorm'),
      uProj: gl.getUniformLocation(this.boxProg, 'uProj')!,
      uView: gl.getUniformLocation(this.boxProg, 'uView')!,
      uModel: gl.getUniformLocation(this.boxProg, 'uModel')!,
      uColor: gl.getUniformLocation(this.boxProg, 'uColor')!,
    }
    this.groundLocs = {
      aPos: gl.getAttribLocation(this.groundProg, 'aPos'),
      aUv: gl.getAttribLocation(this.groundProg, 'aUv'),
      uProj: gl.getUniformLocation(this.groundProg, 'uProj')!,
      uView: gl.getUniformLocation(this.groundProg, 'uView')!,
      uTex: gl.getUniformLocation(this.groundProg, 'uTex')!,
    }

    this.cubeVbo = this.createCubeVbo()
    this.groundVbo = this.createGroundVbo()
    this.groundTex = this.createGroundTexture()
  }

  private createCubeVbo(): WebGLBuffer {
    const gl = this.gl
    const v: number[] = []
    const faces: [number[], [number, number, number]][] = [
      [[1,1,1, 1,1,-1, 1,-1,-1, 1,-1,1], [1, 0, 0]],
      [[-1,1,-1, -1,1,1, -1,-1,1, -1,-1,-1], [-1, 0, 0]],
      [[1,1,1, -1,1,1, -1,1,-1, 1,1,-1], [0, 1, 0]],
      [[1,-1,-1, -1,-1,-1, -1,-1,1, 1,-1,1], [0, -1, 0]],
      [[1,1,-1, -1,1,-1, -1,-1,-1, 1,-1,-1], [0, 0, -1]],
      [[-1,1,1, 1,1,1, 1,-1,1, -1,-1,1], [0, 0, 1]],
    ]
    for (const [pos, n] of faces) {
      const idx = [0, 1, 2, 0, 2, 3]
      for (const i of idx) {
        v.push(pos[i*3], pos[i*3+1], pos[i*3+2], n[0], n[1], n[2])
      }
    }
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW)
    return buf
  }

  private createGroundVbo(): WebGLBuffer {
    const gl = this.gl
    const s = this.groundSize
    const rep = 20
    const v = [
      -s, 0, -s, 0, 0,
       s, 0, -s, rep, 0,
       s, 0,  s, rep, rep,
      -s, 0, -s, 0, 0,
       s, 0,  s, rep, rep,
      -s, 0,  s, 0, rep,
    ]
    const buf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW)
    return buf
  }

  private createGroundTexture(): WebGLTexture {
    const gl = this.gl
    const tex = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, tex)
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#333842'
    ctx.fillRect(0, 0, size, size)
    ctx.fillStyle = '#2a2e36'
    for (let i = 0; i < size; i += 64) {
      ctx.fillRect(i, 0, 32, size)
      ctx.fillRect(0, i, size, 32)
    }
    ctx.strokeStyle = '#ffcc00'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(size/2, size/2, 180, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 6
    ctx.setLineDash([20, 20])
    ctx.beginPath()
    ctx.moveTo(size/2, 0)
    ctx.lineTo(size/2, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, size/2)
    ctx.lineTo(size, size/2)
    ctx.stroke()
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
    gl.generateMipmap(gl.TEXTURE_2D)
    return tex
  }

  resize(w: number, h: number): void {
    this.gl.canvas.width = w
    this.gl.canvas.height = h
    this.gl.viewport(0, 0, w, h)
  }

  render(cam: Camera, boxes: BoxMesh[]): void {
    const gl = this.gl
    const w = gl.canvas.width
    const h = gl.canvas.height
    const aspect = w / h
    const proj = perspective(Math.PI / 3, aspect, 0.1, 500)
    const view = lookAt(cam.x, cam.y, cam.z, cam.rx, cam.ry)

    gl.clearColor(0.12, 0.14, 0.18, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    gl.useProgram(this.groundProg)
    gl.uniformMatrix4fv(this.groundLocs.uProj, false, proj)
    gl.uniformMatrix4fv(this.groundLocs.uView, false, view)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.groundTex)
    gl.uniform1i(this.groundLocs.uTex, 0)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundVbo)
    gl.enableVertexAttribArray(this.groundLocs.aPos)
    gl.enableVertexAttribArray(this.groundLocs.aUv)
    gl.vertexAttribPointer(this.groundLocs.aPos, 3, gl.FLOAT, false, 20, 0)
    gl.vertexAttribPointer(this.groundLocs.aUv, 2, gl.FLOAT, false, 20, 12)
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    gl.useProgram(this.boxProg)
    gl.uniformMatrix4fv(this.boxLocs.uProj, false, proj)
    gl.uniformMatrix4fv(this.boxLocs.uView, false, view)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeVbo)
    gl.enableVertexAttribArray(this.boxLocs.aPos)
    gl.enableVertexAttribArray(this.boxLocs.aNorm)
    gl.vertexAttribPointer(this.boxLocs.aPos, 3, gl.FLOAT, false, 24, 0)
    gl.vertexAttribPointer(this.boxLocs.aNorm, 3, gl.FLOAT, false, 24, 12)

    for (const b of boxes) {
      const model = modelMatrix(b.x, b.y, b.z, b.hx, b.hy, b.hz, b.yaw, b.pitch ?? 0, b.roll ?? 0)
      gl.uniformMatrix4fv(this.boxLocs.uModel, false, model)
      gl.uniform3fv(this.boxLocs.uColor, b.color)
      gl.drawArrays(gl.TRIANGLES, 0, 36)
    }
  }
}
