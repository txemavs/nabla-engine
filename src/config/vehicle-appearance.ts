/** Stock PBR appearance. Values are linear lighting multipliers, not colour corrections. */
export const vehicleAppearanceDefaults = Object.freeze({
  paint: Object.freeze({
    metalness: 0.72,
    roughness: 0.22,
    clearcoat: 0.8,
    clearcoatRoughness: 0.14,
  }),
  chromePaint: Object.freeze({
    metalness: 1,
    roughness: 0.06,
    clearcoat: 0,
    clearcoatRoughness: 0.14,
  }),
  motorcycleColors: Object.freeze([
    '#17191e',
    '#f0f0ea',
    '#b91929',
    '#f5cc19',
    '#2157a5',
    '#aab0b7',
    '#c51b28',
  ]),
  carColors: Object.freeze([
    '#888888',
    '#dadde1',
    '#17191e',
    '#b91929',
    '#2157a5',
    '#f0f0ea',
    '#f07818',
  ]),
  chrome: Object.freeze({ metalness: 1, maxRoughness: 0.32 }),
  wheels: Object.freeze({ metalness: 0.35 }),
  environment: Object.freeze({
    intensity: 0.5,
    nightLevel: 0.15,
    zenith: 170,
    horizon: 245,
    ground: 92,
    nadir: 48,
  }),
})
