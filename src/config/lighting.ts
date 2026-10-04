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
