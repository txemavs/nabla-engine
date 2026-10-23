/** Sparse Cartesian grid. ECEF and local scene metres use the same neighbour lookup. */
export class SpatialIndex {
  constructor(size) {
    this.size = size
    this.cells = new Map()
    this.entries = new Map()
  }
  key(p) {
    return p.map((v) => Math.floor(v / this.size)).join(',')
  }
  set(id, p) {
    const key = this.key(p)
    if (this.entries.get(id)?.key !== key) {
      this.delete(id)
      if (!this.cells.has(key)) this.cells.set(key, new Set())
      this.cells.get(key).add(id)
    }
    this.entries.set(id, { key, p })
  }
  delete(id) {
    const entry = this.entries.get(id)
    if (!entry) return
    const cell = this.cells.get(entry.key)
    cell.delete(id)
    if (!cell.size) this.cells.delete(entry.key)
    this.entries.delete(id)
  }
  near(p, radius) {
    const out = []
    const lo = p.map((v) => Math.floor((v - radius) / this.size))
    const hi = p.map((v) => Math.floor((v + radius) / this.size))
    for (let x = lo[0]; x <= hi[0]; x++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let z = lo[2]; z <= hi[2]; z++)
          for (const id of this.cells.get(`${x},${y},${z}`) ?? []) {
            const distance = Math.hypot(...p.map((v, i) => v - this.entries.get(id).p[i]))
            if (distance <= radius) out.push({ id, distance })
          }
    return out
  }
}
