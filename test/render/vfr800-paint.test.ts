import { readFileSync } from 'node:fs'
import { Mesh, MeshStandardMaterial } from 'three'
import { expect, it } from 'vitest'
import { paintMotorcycle } from '../../src/catalog/presentation/motorcycle-paint.js'
import { loadTexturedGlb } from '../helpers/load-textured-glb.js'

it('repaints the real GLB with paired body/rim finishes and restores the black red stripe', async () => {
  const bytes = readFileSync('assets/library/motorcycles/vfr800fi-1999/vfr800fi-1999.glb')
  const model = (await loadTexturedGlb(bytes)).scene
  const materials = new Map<string, MeshStandardMaterial>()
  model.traverse((node) => {
    if (node instanceof Mesh)
      for (const m of [node.material].flat())
        if (m instanceof MeshStandardMaterial) materials.set(m.name, m)
  })
  const hex = (name: string) => materials.get(name)!.color.getHexString()
  const silencer = hex('VFR silencer subtle reflection')
  for (const [body, rims, tail] of [
    ['#f5cc19', '17191e', 'f5cc19'],
    ['#f0f0ea', 'f0f0ea', 'f0f0ea'],
    ['#aab0b7', 'aab0b7', 'aab0b7'],
    ['#2157a5', 'aab0b7', '2157a5'],
    ['#c51b28', '17191e', 'aab0b7'],
    ['#b91929', '17191e', 'b91929'],
    ['#17191e', '17191e', '17191e'],
  ]) {
    paintMotorcycle(model, body)
    expect(hex('Tank_Paint')).toBe(body.slice(1))
    expect(hex('Front_Fairing_Paint')).toBe(body.slice(1))
    expect(hex('Tail_Fairing_Paint')).toBe(tail)
    expect(hex('Front_Rim_Paint')).toBe(rims)
    expect(hex('Rear_Rim_Paint')).toBe(rims)
    expect(hex('VFR silencer subtle reflection')).toBe(silencer)
    const stripe = materials.get('Red rim stripe 6mm')!
    expect(hex(stripe.name)).toBe(body === '#17191e' ? 'ba1827' : rims)
    expect(stripe.emissiveIntensity).toBe(body === '#17191e' ? 0.15 : 0)
  }
})
