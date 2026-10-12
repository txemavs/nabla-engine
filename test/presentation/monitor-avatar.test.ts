import { describe, expect, it, vi } from 'vitest'
import { DataTexture, Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture, Vector3 } from 'three'
import {
  createMonitorAvatar,
  disposeMonitorAvatar,
  setMonitorPortrait,
  setMonitorHelmetColor,
  setMonitorSunglasses,
  setMonitorVisorPosition,
  setMonitorVisorTint,
  updateMonitorAvatar,
  MonitorMotion,
} from '../../src/render/entity/avatar.js'
import { MonitorFace } from '../../src/render/entity/monitor-face.js'

describe('floating helmet avatar', () => {
  it('shows narrowed eyes and clenched teeth while lifting, then restores the normal face', () => {
    const face = new MonitorFace()
    const texture = face.texture
    const normal = new Uint8Array(texture.image.data as Uint8Array)
    face.update(0, false, true)
    const effort = texture.image.data as Uint8Array
    expect(effort[(4 * 80 + 34) * 4]).toBe(160)
    expect(effort).not.toEqual(normal)
    face.update(0, false, false)
    expect(texture.image.data).toEqual(normal)
    expect(face.texture).toBe(texture)
    face.dispose()
  })
  it('compresses the ear distance to 80 percent and slides the visor along the same shape', () => {
    const model = createMonitorAvatar()
    model.scale.setScalar(1)
    for (const [name, radius] of [
      ['Housing', 0.18],
      ['Screen', 0.1401],
      ['SmokedSunglasses', 0.177],
    ] as const) {
      const mesh = model.getObjectByName(name) as Mesh
      const positions = mesh.geometry.getAttribute('position')
      for (let i = 0; i < positions.count; i++) {
        expect(new Vector3().fromBufferAttribute(positions, i).length()).toBeCloseTo(radius, 6)
      }
    }
    const visor = model.getObjectByName('SmokedSunglasses') as Mesh
    const form = model.getObjectByName('HelmetForm')!
    expect(form.scale.x).toBe(0.8)
    const vertex = new Vector3().fromBufferAttribute(visor.geometry.getAttribute('position'), 300)
    for (const position of [0, 0.25, 0.5, 1]) {
      setMonitorVisorPosition(model, position)
      for (let i = 0; i < 30; i++) updateMonitorAvatar(model, 0.1)
      model.updateMatrixWorld(true)
      expect(form.worldToLocal(visor.localToWorld(vertex.clone())).length()).toBeCloseTo(0.177, 6)
      const left = model.getObjectByName('VisorEarCoverLeft')!.getWorldPosition(new Vector3())
      const right = model.getObjectByName('VisorEarCoverRight')!.getWorldPosition(new Vector3())
      expect(left.distanceTo(right)).toBeCloseTo(0.3574 * 0.8, 6)
      const cover = model.getObjectByName('VisorEarCoverRight') as Mesh
      const coverPositions = cover.geometry.getAttribute('position')
      for (let i = 0; i < coverPositions.count; i++) {
        const p = new Vector3().fromBufferAttribute(coverPositions, i)
        expect(form.worldToLocal(cover.localToWorld(p)).length()).toBeLessThan(0.18)
      }
    }
    expect(model.getObjectByName('FaceGlass')).toBeUndefined()
    const earCover = model.getObjectByName('VisorEarCoverRight') as Mesh
    earCover.geometry.computeBoundingBox()
    expect(earCover.geometry.boundingBox!.max.y).toBeGreaterThan(0.038)
    expect(model.getObjectByName('HingeLeft')).toBeDefined()
    expect(model.getObjectByName('HingeRight')).toBeDefined()
    const material = visor.material as MeshBasicMaterial
    setMonitorVisorTint(model, 0)
    expect(material.opacity).toBeLessThan(0.03)
    setMonitorVisorTint(model, 1)
    expect(material.opacity).toBeCloseTo(0.72)
    setMonitorVisorTint(model, Number.NaN)
    expect(material.opacity).toBeCloseTo(0.72)
    disposeMonitorAvatar(model)
  })
  it('leaves only an open lower rim without a chin guard or propulsion unit', () => {
    const model = createMonitorAvatar()
    model.scale.setScalar(1)
    expect(model.getObjectByName('Levitator')).toBeUndefined()
    expect(model.getObjectByName('PropulsionSocket')).toBeDefined()
    expect(model.getObjectByName('ChinBase')).toBeUndefined()
    const chin = model.getObjectByName('LowerRim') as Mesh
    const vertices = chin.geometry.getAttribute('position')
    for (let i = 0; i < vertices.count; i++) {
      expect(Math.hypot(vertices.getX(i), vertices.getZ(i))).toBeGreaterThan(0.09)
    }
    const motion = new MonitorMotion()
    const position = new Vector3()
    for (let i = 0; i < 600; i++) {
      motion.update(model, position, 0, 1 / 60)
      expect(Math.abs(model.position.y - 0.35)).toBeLessThan(0.002)
    }
    disposeMonitorAvatar(model)
  })
  it('lets players choose helmet paint without recolouring other players, glasses or eyes', () => {
    const player = createMonitorAvatar()
    const other = createMonitorAvatar()
    const housing = player.getObjectByName('Housing') as Mesh<never, MeshBasicMaterial>
    const otherHousing = other.getObjectByName('Housing') as Mesh<never, MeshBasicMaterial>
    const lens = player.getObjectByName('SmokedSunglasses') as Mesh<never, MeshBasicMaterial>
    const lensColour = lens.material.color.clone()
    const foam = (player.getObjectByName('RecessWall') as Mesh<never, MeshStandardMaterial>)
      .material
    const foamColour = foam.color.clone()
    expect(foam.name).toBe('BlackFoam')
    expect(foam.roughness).toBe(1)
    expect(foam.metalness).toBe(0)
    setMonitorHelmetColor(player, '#c62032')
    expect(housing.material.color.getHexString()).toBe('c62032')
    expect(otherHousing.material.color.equals(housing.material.color)).toBe(false)
    expect(lens.material.color.equals(lensColour)).toBe(true)
    expect(foam.color.equals(foamColour)).toBe(true)
    disposeMonitorAvatar(player)
    disposeMonitorAvatar(other)
  })
  it('animates a reusable blue 80 by 24 face and blinks without allocating another texture', () => {
    const face = new MonitorFace()
    const texture = face.texture
    expect([texture.image.width, texture.image.height]).toEqual([80, 24])
    const original = Array.from(texture.image.data!)
    for (let i = 0; i < 49; i++) face.update(0.1)
    expect(face.texture).toBe(texture)
    expect(Array.from(texture.image.data!)).not.toEqual(original)
    face.update(0.1)
    face.update(0.1)
    expect(Array.from(texture.image.data!)).toEqual(original)
    face.dispose()
  })

  it('moves the translucent sunglasses independently of the curved display and driver pose', () => {
    const model = createMonitorAvatar()
    const screen = model.getObjectByName('Screen') as Mesh
    const shades = model.getObjectByName('SunglassesPivot')!
    const lens = model.getObjectByName('SmokedSunglasses') as Mesh
    const original = screen.matrix.clone()
    const pose = model.quaternion.clone()
    setMonitorSunglasses(model, true)
    for (let i = 0; i < 20; i++) updateMonitorAvatar(model, 0.1, true)
    expect(shades.rotation.x).toBeLessThan(0.001)
    expect(screen.matrix.equals(original)).toBe(true)
    expect(model.quaternion.equals(pose)).toBe(true)
    expect((lens.material as MeshBasicMaterial).transparent).toBe(true)
    expect((lens.material as MeshBasicMaterial).opacity).toBeLessThan(0.5)
    const z = screen.geometry.getAttribute('position')
    expect(z.getZ(40)).toBeLessThan(z.getZ(0))
    expect(model.getObjectByName('LowerRim')).toBeDefined()
    const support = model.getObjectByName('VisorSupport')!
    expect(support.parent).toBe(shades)
    expect(model.getObjectByName('VisorUpperBridge')!.parent).toBe(support)
    expect(model.getObjectByName('VisorEarCoverLeft')!.parent).toBe(support)
    expect(model.getObjectByName('VisorEarCoverRight')!.parent).toBe(support)
    disposeMonitorAvatar(model)
  })

  it('accepts a caller-owned human face texture and restores pixels without disposing external media', () => {
    const model = createMonitorAvatar()
    const screen = model.getObjectByName('Screen') as Mesh<never, MeshBasicMaterial>
    const pixels = screen.material.map as DataTexture
    const portrait = new Texture()
    const disposePortrait = vi.spyOn(portrait, 'dispose')
    const disposePixels = vi.spyOn(pixels, 'dispose')
    setMonitorPortrait(model, portrait)
    expect(screen.material.map).toBe(portrait)
    setMonitorSunglasses(model, true)
    updateMonitorAvatar(model, 0.1)
    setMonitorPortrait(model, null)
    expect(screen.material.map).toBe(pixels)
    setMonitorPortrait(model, portrait)
    disposeMonitorAvatar(model)
    disposeMonitorAvatar(model)
    expect(disposePixels).toHaveBeenCalledTimes(1)
    expect(disposePortrait).not.toHaveBeenCalled()
    portrait.dispose()
  })
})
