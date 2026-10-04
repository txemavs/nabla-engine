const modules = import.meta.glob(
  ['../../../assets/library/weapons/**/*.json', '../../../assets/custom/weapons/**/*.json'],
  { eager: true, import: 'default' },
)

/** Same files as the node reader. Vite inlines them so the browser never scans the disk. */
export function readWeaponPresetSources(): { file: string; data: unknown }[] {
  return Object.entries(modules).map(([file, data]) => ({ file, data }))
}
