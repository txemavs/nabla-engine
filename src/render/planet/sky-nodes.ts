import type * as THREE from 'three'
import type { NodeKit, WebGPUSubstitute } from '../webgpu-substitutes.js'

/**
 * TSL equivalents of the GLSL sky (dome + sun disc, air glow, moon, Milky Way, stars), drawn by the
 * WebGPU backend only. Each mirrors its GLSL source line by line; see sky.ts, sun-disc.ts and
 * night-sky.ts for the originals. GLSL `ShaderMaterial`s without `<colorspace_fragment>` write
 * their colour straight to the sRGB canvas, so their TSL twins decode it to linear first: the
 * node output's sRGB encode then lands on the same byte.
 */

/** Sky dome `MeshBasicMaterial` with the `addSunDisc` patch. */
export function sunDiscDome(
  base: THREE.MeshBasicMaterial,
  direction: THREE.Vector3,
  sunColor: THREE.Color,
) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const { uniform, normalize, dot, positionWorld, cameraPosition, cos, radians, fwidth } = tsl
    const { max, smoothstep, exp, float } = tsl
    const material = new webgpu.MeshBasicNodeMaterial()
    const color = uniform(base.color)
    const sun = uniform(direction)
    const nablaSunColor = uniform(sunColor)
    const cosine = dot(normalize(positionWorld.sub(cameraPosition)), normalize(sun))
    const edge = cos(radians(float(0.53)))
    const aa = max(fwidth(cosine), 0.000001)
    const disc = smoothstep(edge.sub(aa), edge.add(aa), cosine)
    const halo = exp(max(0, edge.sub(cosine)).mul(-100000))
    const glare = exp(max(0, edge.sub(cosine)).mul(-1800))
    material.colorNode = asVec3(color).add(
      asVec3(nablaSunColor).mul(disc.mul(30).add(halo.mul(3)).add(glare.mul(0.35))),
    )
    copyState(base, material)
    encodeOutput(material, base.toneMapped, tsl)
    return { material, sync: () => copyState(base, material) }
  }
}

/** `createAirGlow`: additive grazing glow around the globe. */
export function airGlow(base: THREE.Material, sunDirection: THREE.Vector3) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const {
      uniform,
      normalize,
      normalWorldGeometry,
      positionWorld,
      cameraPosition,
      dot,
      pow,
      clamp,
    } = tsl
    const { abs, smoothstep, mix, vec3, vec4, Fn, If, Discard } = tsl
    const material = new webgpu.MeshBasicNodeMaterial()
    const sunUniform = uniform(sunDirection)
    material.colorNode = Fn(() => {
      // The GLSL varying is not flipped on back faces (the camera sits inside this sphere).
      const N = normalize(normalWorldGeometry)
      const V = normalize(cameraPosition.sub(positionWorld))
      const sun = normalize(sunUniform)
      const graz = pow(clamp(abs(dot(N, V)), 0, 1).oneMinus(), 3.1)
      const day = smoothstep(-0.4, 0.28, dot(N, sun))
      const intoSun = smoothstep(0.15, 0.92, dot(sun, V.negate()))
      const col = mix(vec3(0.32, 0.52, 1.0), vec3(1.0, 0.68, 0.38), intoSun)
      const glow = graz.mul(day.mul(0.42).add(0.045)).mul(intoSun.add(0.38))
      If(glow.lessThan(0.012), () => {
        Discard()
      })
      return vec4(col.mul(glow), 1)
    })()
    copyState(base, material)
    return { material }
  }
}

/** `moonMaterial`: lit lunar albedo that washes into the day sky. */
export function moonDisc(
  base: THREE.ShaderMaterial & {
    uniforms: {
      sun: { value: THREE.Vector3 }
      map: { value: THREE.Texture }
      daylight: { value: number }
      skyTint: { value: THREE.Color }
    }
  },
) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const { uniform, texture, uv, normalize, normalWorld, dot, smoothstep, mix, vec3 } = tsl
    const { luminance, pow, float } = tsl
    const material = new webgpu.MeshBasicNodeMaterial()
    const sun = uniform(base.uniforms.sun.value)
    const daylight = uniform(0)
    const skyTint = uniform(base.uniforms.skyTint.value)
    const map = texture(base.uniforms.map.value, uv())
    const albedo = map.rgb
    const lit = smoothstep(-0.04, 0.28, dot(normalize(normalWorld), normalize(sun)))
    const day = smoothstep(0, 1, daylight)
    const lum = luminance(albedo)
    const nightAlbedo = mix(vec3(lum), albedo, 0.25)
    const nightColor = pow(nightAlbedo, vec3(1.12)).mul(lit.mul(1.35).add(0.018))
    const dayAlbedo = mix(vec3(0.9), vec3(lum), 0.18)
    const dayColor = mix(dayAlbedo, skyTint, 0.24)
    material.colorNode = mix(nightColor, dayColor, day)
    material.opacityNode = mix(float(1), lit.mul(0.38), day)
    copyState(base, material)
    encodeOutput(material, true, tsl)
    const sync = () => {
      daylight.value = base.uniforms.daylight.value
      map.value = base.uniforms.map.value
    }
    sync()
    return { material, sync }
  }
}

/** Night-sky Milky Way band (`ShaderMaterial`, no tone mapping, raw output). */
export function milkyWay(
  base: THREE.Material,
  opacity: { value: number },
  galacticPole: { value: THREE.Vector3 },
  galacticCenter: { value: THREE.Vector3 },
) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const { uniform, normalize, positionWorld, cameraPosition, dot, abs, pow, max, exp, mix } = tsl
    const { vec3, Fn, If, Discard } = tsl
    const material = new webgpu.MeshBasicNodeMaterial()
    const opacityUniform = uniform(opacity.value)
    const poleUniform = uniform(galacticPole.value)
    const centerUniform = uniform(galacticCenter.value)
    const d = normalize(positionWorld.sub(cameraPosition))
    const lat = abs(dot(d, normalize(poleUniform)))
    const core = pow(max(dot(d, normalize(centerUniform)), 0), 8)
    const band = exp(
      lat
        .mul(lat)
        .negate()
        .mul(mix(78, 26, core)),
    )
    const alpha = band.mul(core.mul(0.04).add(0.028)).mul(opacityUniform)
    material.colorNode = Fn(() => {
      If(alpha.lessThan(0.008), () => {
        Discard()
      })
      const color = mix(vec3(0.28, 0.3, 0.36), vec3(0.42, 0.38, 0.32), core)
      return color.mul(0.5)
    })()
    // The GLSL band takes its alpha from the shader, not from `material.opacity`.
    material.opacityNode = alpha
    copyState(base, material)
    material.opacity = 1
    return { material, sync: () => (opacityUniform.value = opacity.value) }
  }
}

/**
 * Stars: `Points` whose patched `PointsMaterial` sets `gl_PointSize = starSize` (pixels, not
 * scaled by the pixel ratio). WebGPU draws 1 px points only, so this is a sprite per star.
 */
export function starSprites(points: THREE.Points) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const { instancedBufferAttribute, screenDPR, float } = tsl
    const base = points.material as THREE.PointsMaterial
    const geometry = points.geometry
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    const color = geometry.getAttribute('color') as THREE.BufferAttribute
    const size = geometry.getAttribute('starSize') as THREE.BufferAttribute
    // Instance-rate copies sharing the GLSL geometry's arrays; `sync` forwards its updates.
    const instanced = (source: THREE.BufferAttribute) =>
      new webgpu.InstancedBufferAttribute(source.array, source.itemSize)
    const positions = instanced(position)
    let version = position.version
    const material = new webgpu.PointsNodeMaterial()
    material.positionNode = asVec3(instancedBufferAttribute(positions))
    material.colorNode = asVec3(instancedBufferAttribute(instanced(color)))
    material.sizeNode = float(
      instancedBufferAttribute(instanced(size)) as ReturnType<typeof float>,
    ).div(screenDPR)
    material.sizeAttenuation = false
    encodeOutput(material, base.toneMapped, tsl)
    const sprite = new webgpu.Sprite(material)
    sprite.count = position.count
    sprite.frustumCulled = false
    sprite.name = `${points.name || 'Stars'} (WebGPU)`
    const sync = () => {
      copyState(base, material)
      if (position.version !== version) {
        version = position.version
        positions.needsUpdate = true
      }
    }
    sync()
    return { object: sprite, sync }
  }
}

/**
 * Built-in `MeshBasicMaterial` / `MeshLambertMaterial` of the sky scene (earth, planets, rings) as
 * a node twin that encodes its own output. Colour, map and opacity follow the original each frame.
 * The earth's `onBeforeCompile` cloud/night-light patch is not ported: its twin is plain Lambert.
 */
export function encodedTwin(base: THREE.MeshBasicMaterial | THREE.MeshLambertMaterial) {
  return ({ webgpu, tsl }: NodeKit): WebGPUSubstitute => {
    const material = (base as THREE.MeshLambertMaterial).isMeshLambertMaterial
      ? new webgpu.MeshLambertNodeMaterial()
      : new webgpu.MeshBasicNodeMaterial()
    const sync = () => {
      copyState(base, material)
      material.color.copy(base.color)
      if (material.map !== base.map) {
        material.map = base.map
        material.needsUpdate = true
      }
    }
    sync()
    encodeOutput(material, base.toneMapped, tsl)
    return { material, sync }
  }
}

/**
 * Inverse of the renderer's ACES Filmic + sRGB output transform, so an image already in display
 * values comes out of the frame's final encode unchanged (to 8-bit precision). Mirrors
 * `acesFilmicToneMapping` in three's ToneMappingFunctions.js.
 */
export function decodeDisplay(color: unknown, tsl: NodeKit['tsl']) {
  const { mat3, vec3, float, sRGBTransferEOTF, toneMappingExposure, sqrt, max, min } = tsl
  const y0 = min(sRGBTransferEOTF(asVec3(color)) as ReturnType<typeof vec3>, vec3(0.9999))
  const y = mat3(...ACES_OUTPUT_INVERSE).mul(y0)
  // RRTAndODTFit: y = (v² + 0.0245786 v − 0.000090537) / (0.983729 v² + 0.432951 v + 0.238081)
  const a = y.mul(-0.983729).add(1)
  const b = y.mul(-0.432951).add(0.0245786)
  const c = y.mul(-0.238081).sub(0.000090537)
  const v = b
    .negate()
    .add(sqrt(max(b.mul(b).sub(a.mul(c).mul(4)), 0)))
    .div(a.mul(2))
  return mat3(...ACES_INPUT_INVERSE)
    .mul(max(v, 0))
    .mul(0.6)
    .div(toneMappingExposure as unknown as ReturnType<typeof float>)
}

/**
 * The WebGPU sky pass: draws the sky scene in display space into an 8-bit target, then
 * composites it under the frame through `decodeDisplay`.
 */
export class WebGPUSkyPass {
  private readonly target: THREE.RenderTarget<THREE.Texture>
  private readonly quad: InstanceType<NodeKit['webgpu']['QuadMesh']>
  private readonly size: THREE.Vector2
  constructor({ webgpu, tsl }: NodeKit) {
    this.size = new webgpu.Vector2()
    this.target = new webgpu.RenderTarget<THREE.Texture>(1, 1, { depthBuffer: true })
    const material = new webgpu.NodeMaterial()
    material.fragmentNode = tsl.vec4(
      decodeDisplay(tsl.texture(this.target.texture, tsl.screenUV).rgb, tsl),
      1,
    )
    material.depthTest = false
    material.depthWrite = false
    material.name = 'Nabla sky composite'
    this.quad = new webgpu.QuadMesh(material)
  }
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const gpu = renderer as unknown as InstanceType<NodeKit['webgpu']['WebGPURenderer']>
    const size = gpu.getDrawingBufferSize(this.size)
    if (this.target.width !== size.x || this.target.height !== size.y)
      this.target.setSize(size.x, size.y)
    const previous = gpu.getRenderTarget()
    gpu.setRenderTarget(this.target)
    gpu.clear()
    gpu.render(scene, camera)
    gpu.setRenderTarget(previous)
    this.quad.render(gpu)
  }
  dispose() {
    this.target.dispose()
    const material = this.quad.material as THREE.Material
    material.dispose()
  }
}

/** Material output in display values: optional ACES Filmic, then sRGB encode (WebGL's order). */
function encodeOutput(material: THREE.Material, toneMapped: boolean, tsl: NodeKit['tsl']) {
  const { output, vec4, sRGBTransferOETF, acesFilmicToneMapping, toneMappingExposure } = tsl
  const linear = asVec3(output.rgb)
  const mapped = toneMapped ? acesFilmicToneMapping(linear, toneMappingExposure) : linear
  ;(material as THREE.Material & { outputNode: unknown }).outputNode = vec4(
    sRGBTransferOETF(mapped) as ReturnType<NodeKit['tsl']['vec3']>,
    output.a,
  )
}

function invert3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  return [
    A,
    -(b * i - c * h),
    b * f - c * e,
    B,
    a * i - c * g,
    -(a * f - c * d),
    C,
    -(a * h - b * g),
    a * e - b * d,
  ].map((x) => x / det)
}

// Same literal layout as three's ACESInputMat / ACESOutputMat, so `mat3(...)` builds the inverse.
const ACES_INPUT_INVERSE = invert3([
  0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777,
]) as Parameters<NodeKit['tsl']['mat3']>
const ACES_OUTPUT_INVERSE = invert3([
  1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602,
]) as Parameters<NodeKit['tsl']['mat3']>

/** TSL's typings cannot see that a colour uniform or a buffer attribute is a vec3. */
function asVec3(node: unknown) {
  return node as ReturnType<NodeKit['tsl']['vec3']>
}

/** Blend/depth/visibility state shared by a GLSL original and its node twin. */
function copyState(from: THREE.Material, to: THREE.Material) {
  to.transparent = from.transparent
  to.opacity = from.opacity
  to.depthWrite = from.depthWrite
  to.depthTest = from.depthTest
  to.blending = from.blending
  to.side = from.side
  to.toneMapped = from.toneMapped
  ;(to as { fog?: boolean }).fog = (from as { fog?: boolean }).fog
  to.visible = from.visible
}
