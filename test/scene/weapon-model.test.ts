import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('assembled HK Compact asset', () => {
  it('ships self-contained movable parts at rest, with explicit attachment markers', () => {
    const base = new URL('../../assets/library/weapons/hk-compact/', import.meta.url)
    const data = readFileSync(new URL('hk-compact.glb', base))
    expect(data.readUInt32LE(0)).toBe(0x46546c67)
    expect(data.readUInt32LE(8)).toBe(data.length)
    const gltf = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString())
    const rig = JSON.parse(
      readFileSync(
        new URL('../../assets/rigs/weapons/hk-compact.rig.json', import.meta.url),
        'utf8',
      ),
    )
    expect(rig.units).toBe('metres')
    expect(rig.rest).toBe('assembled')
    for (const name of [...Object.values(rig.parts), ...Object.values(rig.sockets)]) {
      const nodes = gltf.nodes.filter((node: { name: string }) => node.name === name)
      expect(nodes).toHaveLength(1)
    }
    for (const buffer of gltf.buffers) expect(buffer.uri).toBeUndefined()
    expect(gltf.images ?? []).toHaveLength(0)
    const trigger = gltf.nodes.find((node: { name: string }) => node.name === 'Trigger')
    expect(trigger.translation).toEqual([0, 0.083, -0.027])
    const slide = gltf.nodes.find((node: { name: string }) => node.name === 'Slide')
    expect(slide.children.length).toBeGreaterThan(1)
    expect(rig.bounds.max[2] - rig.bounds.min[2]).toBeGreaterThan(0.16)
    expect(rig.bounds.max[2] - rig.bounds.min[2]).toBeLessThan(0.19)
  })
})
