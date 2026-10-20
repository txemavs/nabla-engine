import * as THREE from 'three'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { easuShader, rcasShader } from './fsr1-shaders.js'
import { isWebGPU } from '../backend.js'
import { setWebGPUSubstitute } from '../webgpu-substitutes.js'
import { fsrEasuMaterial, fsrEncodeMaterial, fsrRcasMaterial } from './effect-nodes.js'

/** A full-screen triangle in its own scene, for the WebGPU passes (node twins of each pass). */
function fullScreenScene(material: THREE.Material): { scene: THREE.Scene; mesh: THREE.Mesh } {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
  )
  const mesh = new THREE.Mesh(geometry, material)
  mesh.frustumCulled = false
  const scene = new THREE.Scene()
  scene.add(mesh)
  return { scene, mesh }
}

export const fsrModes = ['off', 'ultra-quality', 'quality', 'balanced', 'performance'] as const
export type FsrMode = (typeof fsrModes)[number]
export interface FsrSettings {
  mode: FsrMode
  sharpness: number
}
export const fsrRatios: Record<FsrMode, number> = {
  off: 1,
  'ultra-quality': 1 / 1.3,
  quality: 1 / 1.5,
  balanced: 1 / 1.7,
  performance: 0.5,
}
export function resolveFsr(settings: Partial<FsrSettings> = {}): FsrSettings {
  const mode = settings.mode ?? 'off',
    sharpness = settings.sharpness ?? 0.5
  if (!fsrModes.includes(mode) || !Number.isFinite(sharpness) || sharpness < 0 || sharpness > 1)
    throw new RangeError('Invalid FSR mode or sharpness (0..1)')
  return { mode, sharpness }
}
export function fsrSize(width: number, height: number, mode: FsrMode): [number, number] {
  return [
    Math.max(1, Math.round(width * fsrRatios[mode])),
    Math.max(1, Math.round(height * fsrRatios[mode])),
  ]
}

/** Desktop spatial upscaling. Linear HDR -> display encoding -> AMD EASU -> AMD RCAS. */
export class Fsr1 {
  private config = resolveFsr()
  private source: THREE.WebGLRenderTarget | null = null
  private encoded: THREE.WebGLRenderTarget | null = null
  private scaled: THREE.WebGLRenderTarget | null = null
  private readonly output = new OutputPass()
  private readonly easu: THREE.ShaderMaterial
  private readonly rcas: THREE.ShaderMaterial
  private readonly quad: FullScreenQuad
  private readonly size = new THREE.Vector2()
  private readonly viewport = new THREE.Vector4()
  private readonly scissor = new THREE.Vector4()
  private scissorTest = false
  private autoClear = true
  private previous: THREE.WebGLRenderTarget | null = null
  private active = false
  constructor() {
    const make = (name: string, fragmentShader: string) =>
      new THREE.ShaderMaterial({
        name,
        glslVersion: THREE.GLSL3,
        toneMapped: false,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          inputTexture: { value: null },
          inputSize: { value: new THREE.Vector2() },
          outputSize: { value: new THREE.Vector2() },
          sharpness: { value: 0.5 },
        },
        vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader,
      })
    this.easu = make('FSR1 EASU', easuShader)
    this.rcas = make('FSR1 RCAS', rcasShader)
    this.quad = new FullScreenQuad(this.easu)
    const encodeSource = { value: null as THREE.Texture | null }
    this.webgpuPasses = {
      source: encodeSource,
      encode: fullScreenScene(new THREE.MeshBasicMaterial()),
      easu: fullScreenScene(this.easu),
      rcas: fullScreenScene(this.rcas),
    }
    setWebGPUSubstitute(this.webgpuPasses.encode.mesh, fsrEncodeMaterial(encodeSource))
    setWebGPUSubstitute(this.webgpuPasses.easu.mesh, fsrEasuMaterial(this.easu))
    setWebGPUSubstitute(this.webgpuPasses.rcas.mesh, fsrRcasMaterial(this.rcas))
  }
  /** WebGPU: `OutputPass`, EASU and RCAS as full-screen node passes (effect-nodes.ts). */
  private readonly webgpuPasses: {
    source: { value: THREE.Texture | null }
    encode: { scene: THREE.Scene; mesh: THREE.Mesh }
    easu: { scene: THREE.Scene; mesh: THREE.Mesh }
    rcas: { scene: THREE.Scene; mesh: THREE.Mesh }
  }
  private readonly passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  get settings(): FsrSettings {
    return { ...this.config }
  }
  setSettings(settings: Partial<FsrSettings>): void {
    this.config = resolveFsr({ ...this.config, ...settings })
    if (this.config.mode === 'off') this.release()
  }
  get input(): THREE.WebGLRenderTarget | null {
    return this.source
  }
  get inputSize(): THREE.Vector2 {
    return this.size
  }
  /** Called after auxiliary views, so mirrors/portals keep their own resolution. */
  begin(renderer: THREE.WebGLRenderer): boolean {
    if (this.config.mode === 'off' || renderer.xr?.isPresenting) return false
    renderer.getDrawingBufferSize(this.size)
    const width = this.size.x,
      height = this.size.y
    const [w, h] = fsrSize(width, height, this.config.mode)
    if (
      !this.source ||
      this.source.width !== w ||
      this.source.height !== h ||
      this.scaled?.width !== width ||
      this.scaled?.height !== height
    ) {
      this.release()
      this.source = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.HalfFloatType,
        samples: Math.min(4, renderer.capabilities?.maxSamples ?? 4),
      })
      this.source.texture.colorSpace = THREE.LinearSRGBColorSpace
      this.encoded = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false })
      this.scaled = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false })
      // Display-encoded data is deliberately untagged: no implicit sRGB decoding on sampling.
      this.easu.uniforms.inputTexture.value = this.encoded.texture
      this.easu.uniforms.inputSize.value.set(w, h)
      this.easu.uniforms.outputSize.value.set(width, height)
      this.rcas.uniforms.inputTexture.value = this.scaled.texture
      this.rcas.uniforms.inputSize.value.set(width, height)
    }
    this.size.set(w, h)
    this.previous = renderer.getRenderTarget()
    renderer.getViewport(this.viewport)
    renderer.getScissor(this.scissor)
    this.scissorTest = renderer.getScissorTest()
    this.autoClear = renderer.autoClear
    this.active = true
    renderer.setRenderTarget(this.source)
    renderer.setScissorTest(false)
    return true
  }
  present(renderer: THREE.WebGLRenderer): void {
    if (!this.active || !this.source || !this.encoded || !this.scaled) return
    if (isWebGPU(renderer)) return this.presentWebGPU(renderer)
    try {
      renderer.autoClear = true
      this.output.render(renderer, this.encoded, this.source, 0, false)
      renderer.setRenderTarget(this.scaled)
      this.quad.material = this.easu
      this.quad.render(renderer)
      renderer.setRenderTarget(this.previous)
      renderer.setViewport(this.viewport)
      renderer.setScissor(this.scissor)
      renderer.setScissorTest(this.scissorTest)
      this.rcas.uniforms.sharpness.value = this.config.sharpness
      this.quad.material = this.rcas
      this.quad.render(renderer)
    } finally {
      this.restore(renderer)
    }
  }
  private presentWebGPU(renderer: THREE.WebGLRenderer): void {
    const passes = this.webgpuPasses
    const toneMapping = renderer.toneMapping,
      colorSpace = renderer.outputColorSpace
    try {
      renderer.autoClear = true
      passes.source.value = this.source!.texture
      renderer.setRenderTarget(this.encoded)
      renderer.render(passes.encode.scene, this.passCamera)
      renderer.setRenderTarget(this.scaled)
      renderer.render(passes.easu.scene, this.passCamera)
      renderer.setRenderTarget(this.previous)
      renderer.setViewport(this.viewport)
      renderer.setScissor(this.scissor)
      renderer.setScissorTest(this.scissorTest)
      this.rcas.uniforms.sharpness.value = this.config.sharpness
      // RCAS writes display-encoded colour: no second tone map or sRGB encode on the way out.
      renderer.toneMapping = THREE.NoToneMapping
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace
      renderer.render(passes.rcas.scene, this.passCamera)
    } finally {
      renderer.toneMapping = toneMapping
      renderer.outputColorSpace = colorSpace
      this.restore(renderer)
    }
  }
  /** Restore state even when the world, focus or post pass throws. */
  restore(renderer: THREE.WebGLRenderer): void {
    if (!this.active) return
    renderer.setRenderTarget(this.previous)
    renderer.setViewport(this.viewport)
    renderer.setScissor(this.scissor)
    renderer.setScissorTest(this.scissorTest)
    renderer.autoClear = this.autoClear
    this.active = false
  }
  private release(): void {
    this.source?.dispose()
    this.encoded?.dispose()
    this.scaled?.dispose()
    this.source = this.encoded = this.scaled = null
    this.easu.uniforms.inputTexture.value = this.rcas.uniforms.inputTexture.value = null
  }
  dispose(): void {
    this.release()
    this.easu.dispose()
    this.rcas.dispose()
    this.output.dispose()
    this.quad.dispose()
    for (const pass of [this.webgpuPasses.encode, this.webgpuPasses.easu, this.webgpuPasses.rcas])
      pass.mesh.geometry.dispose()
  }
}
