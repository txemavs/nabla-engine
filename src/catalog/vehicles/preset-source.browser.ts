const modules = import.meta.glob(
  [
    '../../../assets/library/{cars,motorcycles,planes,ships,boats}/**/*.json',
    '../../../assets/custom/{cars,motorcycles,planes,ships,boats}/**/*.json',
    // Asset manifests and authoring sidecars are not presets; see preset-source.ts.
    '!**/asset.json',
    '!**/*.rig.json',
    '!**/*.specs.json',
  ],
  { eager: true, import: 'default' },
)

/** Same files as the node reader. Vite inlines them so the browser never scans the disk. */
export function readVehiclePresetSources(): { file: string; data: unknown }[] {
  return Object.entries(modules).map(([file, data]) => ({ file, data }))
}
