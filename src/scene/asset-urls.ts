/** One explicit stock-library URL migration; custom and remote URLs are untouched. */
export function migrateStockAssetUrls(value: unknown): void {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (
      key === 'url' &&
      typeof child === 'string' &&
      /^\/studio\/(cars|trucks|ships|weapons|portals)\//.test(child)
    ) {
      ;(value as Record<string, unknown>)[key] = child
        .replace('/studio/', '/library/')
        .replace('/white-truck-studio/', '/white-truck/')
    } else if (child && typeof child === 'object') migrateStockAssetUrls(child)
  }
}
