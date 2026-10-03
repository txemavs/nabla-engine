const modules = import.meta.glob(
  [
    '../../../assets/studio/{cars,trucks,planes,ships,boats}/**/*.json',
    '../../../assets/custom/{cars,trucks,planes,ships,boats}/**/*.json',
  ],
  { eager: true, import: 'default' },
)

/** Same files as the node reader. Vite inlines them so the browser never scans the disk. */
export function readVehiclePresetSources(): { file: string; data: unknown }[] {
  return Object.entries(modules)
    .filter(([, data]) => {
      const obj = data as Record<string, unknown>
      // Skip non-preset files (must have label and vehicle fields)
      return typeof obj.label === 'string' && typeof obj.vehicle === 'object'
    })
    .map(([file, data]) => ({ file, data }))
}
