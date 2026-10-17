import { ShaderLib } from 'three'

let installed = false

/**
 * Depth-texture PCF shadow maps compare projected depth, not logarithmic scene depth.
 * Perspective shadow cameras otherwise write logarithmic depth while their receivers
 * compare projected depth, incorrectly shadowing surfaces with geometry behind them.
 * Keep depth-material writes consistent with their encoded projected depth; colour
 * passes retain logarithmic depth. Install before the first shader compilation.
 */
export function installProjectedShadowDepth(): void {
  if (installed) return
  const chunk = '#include <logdepthbuf_fragment>'
  if (!ShaderLib.depth.fragmentShader.includes(chunk))
    throw new Error('Unsupported Three.js depth shader layout')
  ShaderLib.depth.fragmentShader = ShaderLib.depth.fragmentShader.replace(
    chunk,
    '#ifdef USE_LOGARITHMIC_DEPTH_BUFFER\n gl_FragDepth = gl_FragCoord.z;\n#endif',
  )
  installed = true
}
