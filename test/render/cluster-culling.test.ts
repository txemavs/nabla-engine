import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  buildTileClusters,
  installTileClusterCulling,
  parseClusterCulling,
  visibleClusterSpan,
} from '../../src/render/planet/cluster-culling.js'

/** A flat 256 m square on XZ, `n`×`n` quads (2n² triangles). */
function grid(n: number, indexed: boolean): THREE.BufferGeometry {
  const plane = new THREE.PlaneGeometry(256, 256, n, n)
  plane.rotateX(-Math.PI / 2)
  return indexed ? plane : plane.toNonIndexed()
}

/** Sorted triangle keys (rounded corner coordinates), to compare triangle sets. */
function triangleSet(geometry: THREE.BufferGeometry): string[] {
  const position = geometry.getAttribute('position')
  const index = geometry.index
  const count = index ? index.count : position.count
  const keys: string[] = []
  for (let t = 0; t < count; t += 3) {
    const corners: string[] = []
    for (let k = 0; k < 3; k++) {
      const v = index ? index.getX(t + k) : t + k
      corners.push([position.getX(v), position.getY(v), position.getZ(v)].map(Math.round).join())
    }
    keys.push(corners.join('|'))
  }
  return keys.sort()
}

describe('tile cluster culling', () => {
  it('reorders triangles without changing the triangle set', () => {
    for (const indexed of [true, false]) {
      const geometry = grid(64, indexed)
      const before = triangleSet(geometry)
      const clusters = buildTileClusters(geometry)!
      expect(clusters).toBeDefined()
      expect(triangleSet(geometry)).toEqual(before)
      expect(clusters.counts.reduce((a, b) => a + b, 0)).toBe(clusters.total)
      // 64×64 quads over an 8×8 grid: every cluster holds 8×8 quads.
      expect([...clusters.counts].every((count) => count === 8 * 8 * 6)).toBe(true)
    }
  })

  it('leaves small meshes alone', () => {
    expect(buildTileClusters(grid(8, true))).toBeUndefined()
  })

  it('narrows the draw range to the clusters in view and restores it after the draw', () => {
    const mesh = new THREE.Mesh(grid(64, true), new THREE.MeshBasicMaterial())
    mesh.updateMatrixWorld()
    expect(installTileClusterCulling(mesh)).toBe(true)
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000)
    camera.position.set(-120, 300, -120)
    camera.lookAt(-120, 0, -120)
    camera.updateMatrixWorld()
    const geometry = mesh.geometry
    const full = geometry.index!.count
    const renderer = {} as THREE.WebGLRenderer
    const scene = new THREE.Scene()
    mesh.onBeforeRender(renderer, scene, camera, geometry, mesh.material, null as never)
    expect(geometry.drawRange.count).toBeGreaterThan(0)
    expect(geometry.drawRange.count).toBeLessThan(full / 2)
    mesh.onAfterRender(renderer, scene, camera, geometry, mesh.material, null as never)
    expect(geometry.drawRange.start).toBe(0)
    expect(geometry.drawRange.count).toBe(Infinity)
  })

  it('draws nothing when no cluster is in view, everything when all are', () => {
    const geometry = grid(64, true)
    const clusters = buildTileClusters(geometry)!
    const mesh = new THREE.Mesh(geometry)
    mesh.updateMatrixWorld()
    const away = new THREE.PerspectiveCamera(30, 1, 1, 1000)
    away.position.set(0, 50, 0)
    away.lookAt(0, 100, 0)
    away.updateMatrixWorld()
    expect(visibleClusterSpan(clusters, mesh, away)[1]).toBe(0)
    const above = new THREE.PerspectiveCamera(90, 1, 1, 5000)
    above.position.set(0, 1000, 0)
    above.lookAt(0, 0, 0)
    above.updateMatrixWorld()
    expect(visibleClusterSpan(clusters, mesh, above)).toEqual([0, clusters.total])
  })

  it('parses the URL flag', () => {
    expect(parseClusterCulling('')).toBe(false)
    expect(parseClusterCulling('?clusterCulling=0')).toBe(false)
    expect(parseClusterCulling('?clusterCulling=1')).toBe(true)
    expect(parseClusterCulling('?clusterCulling')).toBe(true)
  })
})
