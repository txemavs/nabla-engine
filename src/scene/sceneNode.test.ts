import { describe, it, expect } from 'vitest'
import {
  SceneNode,
  identityTransform,
  transformToMat4,
  mulMat4,
  mat4Position,
  mat4ToEuler,
  sceneDebugLines,
} from './sceneNode.js'

describe('SceneNode', () => {
  describe('identityTransform', () => {
    it('returns zero position/rotation and unit scale', () => {
      const t = identityTransform()
      expect(t.x).toBe(0)
      expect(t.y).toBe(0)
      expect(t.z).toBe(0)
      expect(t.yaw).toBe(0)
      expect(t.pitch).toBe(0)
      expect(t.roll).toBe(0)
      expect(t.sx).toBe(1)
      expect(t.sy).toBe(1)
      expect(t.sz).toBe(1)
    })
  })

  describe('transformToMat4', () => {
    it('identity transform produces identity matrix', () => {
      const m = transformToMat4(identityTransform())
      expect(m[0]).toBeCloseTo(1)
      expect(m[5]).toBeCloseTo(1)
      expect(m[10]).toBeCloseTo(1)
      expect(m[15]).toBeCloseTo(1)
      expect(m[12]).toBe(0)
      expect(m[13]).toBe(0)
      expect(m[14]).toBe(0)
    })

    it('translation appears in last column', () => {
      const t = { ...identityTransform(), x: 1, y: 2, z: 3 }
      const m = transformToMat4(t)
      expect(m[12]).toBe(1)
      expect(m[13]).toBe(2)
      expect(m[14]).toBe(3)
    })
  })

  describe('mat4Position', () => {
    it('extracts position from matrix', () => {
      const t = { ...identityTransform(), x: 5, y: 6, z: 7 }
      const m = transformToMat4(t)
      const pos = mat4Position(m)
      expect(pos.x).toBe(5)
      expect(pos.y).toBe(6)
      expect(pos.z).toBe(7)
    })
  })

  describe('mat4ToEuler', () => {
    it('extracts zero angles from identity', () => {
      const m = transformToMat4(identityTransform())
      const e = mat4ToEuler(m)
      expect(e.yaw).toBeCloseTo(0)
      expect(e.pitch).toBeCloseTo(0)
      expect(e.roll).toBeCloseTo(0)
    })

    it('extracts yaw rotation', () => {
      const t = { ...identityTransform(), yaw: 45 }
      const m = transformToMat4(t)
      const e = mat4ToEuler(m)
      expect(e.yaw).toBeCloseTo(45)
      expect(e.pitch).toBeCloseTo(0, 0)
      expect(e.roll).toBeCloseTo(0, 0)
    })
  })

  describe('SceneNode hierarchy', () => {
    it('root node has no parent', () => {
      const node = new SceneNode('root')
      expect(node.parent).toBeNull()
    })

    it('attach sets parent reference', () => {
      const parent = new SceneNode('parent')
      const child = new SceneNode('child')
      parent.attach(child)
      expect(child.parent).toBe(parent)
      expect(parent.children).toContain(child)
    })

    it('detach removes parent reference', () => {
      const parent = new SceneNode('parent')
      const child = new SceneNode('child')
      parent.attach(child)
      parent.detach(child)
      expect(child.parent).toBeNull()
      expect(parent.children).not.toContain(child)
    })

    it('child world position includes parent transform', () => {
      const parent = new SceneNode('parent')
      parent.setLocal({ x: 10, y: 0, z: 0 })

      const child = new SceneNode('child')
      parent.attach(child)
      // After attaching, set local position relative to parent
      child.setLocal({ x: 5, y: 0, z: 0 })

      const worldPos = child.worldPosition
      expect(worldPos.x).toBeCloseTo(15)  // parent.x + child.localX
    })

    it('attach preserves world position', () => {
      const parent = new SceneNode('parent')
      parent.setLocal({ x: 10, y: 0, z: 0 })

      const child = new SceneNode('child')
      child.setLocal({ x: 20, y: 5, z: 0 })

      const beforeWorld = child.worldPosition
      parent.attach(child)
      const afterWorld = child.worldPosition

      expect(afterWorld.x).toBeCloseTo(beforeWorld.x)
      expect(afterWorld.y).toBeCloseTo(beforeWorld.y)
      expect(afterWorld.z).toBeCloseTo(beforeWorld.z)
    })

    it('detach preserves world position', () => {
      const parent = new SceneNode('parent')
      parent.setLocal({ x: 10, y: 0, z: 0 })

      const child = new SceneNode('child')
      parent.attach(child)
      child.setLocal({ x: 5, y: 0, z: 0 })

      const beforeWorld = child.worldPosition
      parent.detach(child)
      const afterWorld = child.worldPosition

      expect(afterWorld.x).toBeCloseTo(beforeWorld.x)
    })

    it('setWorldPose works correctly with parent', () => {
      const parent = new SceneNode('parent')
      parent.setLocal({ x: 10, y: 5, z: 0 })

      const child = new SceneNode('child')
      parent.attach(child)

      child.setWorldPose({ x: 20, y: 10, z: 3 })
      const world = child.worldPosition

      expect(world.x).toBeCloseTo(20)
      expect(world.y).toBeCloseTo(10)
      expect(world.z).toBeCloseTo(3)
    })

    it('find locates descendant by name', () => {
      const root = new SceneNode('root')
      const a = new SceneNode('a')
      const b = new SceneNode('b')
      const c = new SceneNode('c')
      root.attach(a)
      a.attach(b)
      a.attach(c)

      expect(root.find('c')).toBe(c)
      expect(root.find('b')).toBe(b)
      expect(root.find('missing')).toBeNull()
    })

    it('traverse visits all nodes', () => {
      const root = new SceneNode('root')
      const a = new SceneNode('a')
      const b = new SceneNode('b')
      root.attach(a)
      root.attach(b)

      const visited: string[] = []
      root.traverse((n) => visited.push(n.name))

      expect(visited).toContain('root')
      expect(visited).toContain('a')
      expect(visited).toContain('b')
      expect(visited.length).toBe(3)
    })
  })

  describe('sceneDebugLines', () => {
    it('generates 3 axis lines per node', () => {
      const node = new SceneNode('test')
      const lines = sceneDebugLines(node)
      // 3 axes (RGB)
      expect(lines.length).toBe(3)
    })

    it('generates parent-child connection lines', () => {
      const parent = new SceneNode('parent')
      const child = new SceneNode('child')
      parent.attach(child)

      const lines = sceneDebugLines(parent)
      // parent: 3 axes, child: 3 axes + 1 connection
      expect(lines.length).toBe(7)

      // Find cyan connection line
      const cyan = lines.filter((l) => l.r === 0 && l.g === 1 && l.b === 1)
      expect(cyan.length).toBe(1)
    })
  })
})
