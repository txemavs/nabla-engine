const modules = import.meta.glob(
  [
    '../../../assets/studio/{cars,planes,ships,boats}/**/*.json',
    '../../../assets/custom/{cars,planes,ships,boats}/**/*.json',
  ],
  { eager: true, import: 'default' },
)

/** Same files as the node reader. Vite inlines them so the browser never scans the disk. */
export function readVehiclePresetSources(): { file: string; data: unknown }[] {
  return Object.entries(modules).map(([file, data]) => ({ file, data }))
}
