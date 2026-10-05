/** Browser fallback lights and geographic field-light defaults. Colors are sRGB hex. */
export const lightingDefaults = Object.freeze({
  /** Fallback directional light color and Three.js intensity. */
  sunColor: '#ffe1b1',
  sunIntensity: 3.2,
  /** Fallback ambient light color and Three.js intensity. */
  ambientColor: '#dce7f5',
  ambientIntensity: 0.22,
  /** Atmospheric daylight factor below which presentation is considered night, [0, 1]. */
  nightThreshold: 0.15,
  /** Subtle vehicle footwell fill: point-light intensity in candela. */
  courtesyIntensity: 0.08,
  /** Local footwell cutoff in metres; prevents broad cabin/exterior spill. */
  courtesyReach: 0.65,
  /** Small courtesy-lens emissive multiplier, independent of the fill light. */
  courtesyLensIntensity: 0.025,
  /** Resolution and normalized upper edge of the low-beam projection texture. */
  lowBeamMaskSize: 128,
  lowBeamCutoff: 0.5,
  /** Normalized transition width at the cutoff and horizontal falloff exponent. */
  lowBeamCutoffSoftness: 0.025,
  lowBeamSpreadPower: 4,
  /** Show geographic street lamps and navigation marks when field lights are enabled. */
  lamps: true,
  navigation: true,
  /** Street-light intensity multiplier and reach in metres. */
  level: 10,
  reach: 28,
  /** Permit geographic lamps to emit light. */
  armed: true,
  /** Maximum simultaneously active street-light spotlights. */
  maxBeams: 8,
})
