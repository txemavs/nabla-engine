import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { lampFromMaterialName } from '../../src/render/vehicle-presentation/authored-lights.js'

const channels: Record<string, string> = {
  LowBeam: 'low',
  HighBeam: 'high',
  Fog: 'fog',
  Tail_Stop: 'tail-stop',
  Reverse: 'reverse',
  Indicator: 'signal',
  Marker: 'marker',
}
const document = (bytes: Buffer) =>
  JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)))
const binary = (bytes: Buffer) => bytes.subarray(20 + bytes.readUInt32LE(12))

it('authors current names without changing existing lamp bindings or GLB binary payload, and is repeatable', () => {
  const temp = mkdtempSync(join(tmpdir(), 'nabla-truck-lights-'))
  const relative = 'assets/library/trucks/white-truck/assets'
  const destination = join(temp, relative)
  const names = ['tractor.modern', 'trailer.anchored']
  mkdirSync(destination, { recursive: true })
  try {
    for (const name of names)
      copyFileSync(`${relative}/${name}.glb`, join(destination, `${name}.glb`))
    execFileSync(process.execPath, [resolve('scripts/author-truck-rear-lights.mjs')], { cwd: temp })
    const first = names.map((name) => readFileSync(join(destination, `${name}.glb`)))
    for (const [index, name] of names.entries()) {
      const old = readFileSync(`${relative}/${name}.glb`)
      const before = document(old)
      const after = document(first[index])
      expect(binary(first[index])).toEqual(binary(old))
      expect(after.materials).toHaveLength(before.materials.length)
      let checked = 0
      for (const [i, material] of before.materials.entries()) {
        const oldChannel = material.extras?.vehicleLightChannel
        if (!oldChannel) continue
        checked++
        expect(channels[oldChannel]).toBeDefined()
        const next = after.materials[i]
        expect(lampFromMaterialName(next.name)).toEqual({
          channel: channels[oldChannel],
          side:
            material.extras.vehicleLightSide === 'L'
              ? -1
              : material.extras.vehicleLightSide === 'R'
                ? 1
                : 0,
        })
        expect(next.extras?.vehicleLightChannel).toBeUndefined()
        expect(next.extras?.vehicleLightSide).toBeUndefined()
        expect(next.emissiveFactor).toEqual(material.emissiveFactor)
      }
      expect(checked).toBeGreaterThan(0)
    }
    execFileSync(process.execPath, [resolve('scripts/author-truck-rear-lights.mjs')], { cwd: temp })
    for (const [i, name] of names.entries())
      expect(readFileSync(join(destination, `${name}.glb`))).toEqual(first[i])
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
})
