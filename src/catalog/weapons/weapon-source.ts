import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const buckets = ['library', 'custom']

/** assets/ next to this repo, the built package, or a prepare-dist compile. */
function assetsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [
    join(here, '../../../assets'),
    join(here, '../../../../assets'),
    join(process.cwd(), 'assets'),
  ]
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0]
}

function jsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...jsonFiles(path))
    else if (entry.name.endsWith('.json')) found.push(path)
  }
  return found
}

export function readWeaponPresetSources(): { file: string; data: unknown }[] {
  const root = assetsDir()
  const found: { file: string; data: unknown }[] = []
  for (const bucket of buckets)
    for (const file of jsonFiles(join(root, bucket, 'weapons')))
      found.push({ file, data: JSON.parse(readFileSync(file, 'utf8')) as unknown })
  return found
}
