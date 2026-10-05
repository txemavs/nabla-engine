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
  /** Indicator half-cycle in milliseconds, shared by tractor and attached trailers. */
  signalFlashMs: 450,
  /** Stop-lamp emission relative to the same lens used as a tail light. */
  brakeBoost: 3,
  /** Resolution and normalized upper edge of the low-beam projection texture. */
  lowBeamMaskSize: 128,
  lowBeamCutoff: 0.5,
  /** Normalized transition width at the cutoff and horizontal falloff exponent. */
  lowBeamCutoffSoftness: 0.04,
  lowBeamSpreadPower: 3.5,
  /**
   * Multiplier on every driving beam (LowBeam / HighBeam / Fog), authored GLB lamps and the
   * code-built car beams alike. Slightly under 1 so the pool does not burn out the road.
   */
  headlightIntensityScale: 0.85,
  /** Added to each beam spot's penumbra (capped at 1) for a softer cone edge. */
  headlightPenumbraBoost: 0.1,
  /**
   * Code-built car beams (S3), matching the white truck's authored GLB lamps: candela, reach in
   * metres, inner/outer cone half-angles in radians (glTF convention), decay 2, aimed slightly down.
   */
  lowBeamIntensity: 1800,
  lowBeamRange: 55,
  lowBeamInnerCone: 0.35,
  lowBeamOuterCone: 0.65,
  highBeamIntensity: 18000,
  highBeamRange: 130,
  highBeamInnerCone: 0.16,
  highBeamOuterCone: 0.38,
  /** Downward aim of code-built beams in radians (the truck's lamps tilt by the same 0.035). */
  headlightTilt: 0.035,
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
  /** Fixed renderer budget for occupied-vehicle illumination. Parked GLB lights stay hidden. */
  vehicleSpots: 6,
  vehiclePoints: 10,
  vehicleMappedSpots: 2,
})
