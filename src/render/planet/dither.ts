/**
 * Interleaved gradient noise (Jimenez 2014), ±0.5/255 in output space.
 * Applied last in a fragment shader so smooth dark gradients (air rim, sun halo)
 * do not quantize into visible 8-bit bands. Zero-mean, so average colour is unchanged.
 */
export const DITHER_GLSL = /* glsl */ `
vec3 nablaDither(vec3 color) {
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  return color + (n - 0.5) / 255.0;
}
`
