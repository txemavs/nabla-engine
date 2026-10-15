/** Authored low variants share the original model's axes, scale and rig anchors. */
export type AssetQuality = 'low' | 'full'

/** Low GPU profiles and standalone Quest browsers prefer reduced geometry before loading. */
export function assetQualityForDevice(preset: string, userAgent = ''): AssetQuality {
  return ['minimal', 'mobile', 'low', 'road'].includes(preset) ||
    /OculusBrowser|Quest/i.test(userAgent)
    ? 'low'
    : 'full'
}

/** Assets without a low variant keep their normal model. */
export function assetUrlForQuality(
  part: { url: string; lowUrl?: string },
  quality: AssetQuality,
): string {
  return quality === 'low' ? (part.lowUrl ?? part.url) : part.url
}
