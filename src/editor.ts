import { createEntity, parseScene, SceneGraph, type Entity, type SceneDocument } from './scene.js'

/** Transactions store authored data only. Physics never writes into this history. */
export class SceneEditor {
  private current: SceneDocument
  private past: SceneDocument[] = []
  private future: SceneDocument[] = []
  constructor(document: SceneDocument) {
    this.current = parseScene(document)
  }
  get document(): SceneDocument {
    return structuredClone(this.current)
  }
  get canUndo(): boolean {
    return this.past.length > 0
  }
  get canRedo(): boolean {
    return this.future.length > 0
  }
  private commit(next: SceneDocument): void {
    const checked = parseScene(next)
    if (JSON.stringify(checked) === JSON.stringify(this.current)) return
    this.past.push(this.current)
    if (this.past.length > 100) this.past.shift()
    this.current = checked
    this.future = []
  }
  update(id: string, patch: Partial<Omit<Entity, 'id' | 'parentId'>>): void {
    const next = this.document
    const entity = next.entities.find((e) => e.id === id)
    if (!entity) throw new Error('Unknown entity: ' + id)
    Object.assign(entity, patch)
    this.commit(next)
  }
  add(kind: Entity['kind']): string {
    const next = this.document,
      id = crypto.randomUUID()
    next.entities.push(createEntity(id, kind, [0, kind === 'vehicle' ? 1 : 1, 0]))
    this.commit(next)
    return id
  }
  duplicate(id: string): string {
    const next = this.document
    const source = next.entities.find((e) => e.id === id)
    if (!source) throw new Error('Unknown entity: ' + id)
    const ids = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      for (const e of next.entities)
        if (e.parentId && ids.has(e.parentId) && !ids.has(e.id)) {
          ids.add(e.id)
          changed = true
        }
    }
    const remap = new Map([...ids].map((old) => [old, crypto.randomUUID()]))
    const copies = next.entities
      .filter((e) => ids.has(e.id))
      .map((e) => ({
        ...structuredClone(e),
        id: remap.get(e.id)!,
        parentId: e.parentId && remap.has(e.parentId) ? remap.get(e.parentId)! : e.parentId,
      }))
    const root = copies.find((e) => e.id === remap.get(id))!
    root.name += ' · copia'
    root.transform.position[0] += 3
    next.entities.push(...copies)
    this.commit(next)
    return root.id
  }
  remove(id: string): void {
    if (!this.current.entities.some((e) => e.id === id)) throw new Error('Unknown entity: ' + id)
    const next = this.document,
      removed = new Set([id])
    let changed = true
    while (changed) {
      changed = false
      for (const e of next.entities)
        if (e.parentId && removed.has(e.parentId) && !removed.has(e.id)) {
          removed.add(e.id)
          changed = true
        }
    }
    next.entities = next.entities.filter((e) => !removed.has(e.id))
    this.commit(next)
  }
  reparent(id: string, parentId: string | null): void {
    const next = this.document,
      graph = new SceneGraph(next)
    const e = next.entities.find((item) => item.id === id)
    if (!e) throw new Error('Unknown entity: ' + id)
    e.transform = graph.localFromWorld(parentId, graph.worldTransform(id))
    e.parentId = parentId
    this.commit(next)
  }
  undo(): void {
    const prev = this.past.pop()
    if (prev) {
      this.future.push(this.current)
      this.current = prev
    }
  }
  redo(): void {
    const next = this.future.pop()
    if (next) {
      this.past.push(this.current)
      this.current = next
    }
  }
  load(raw: unknown): void {
    this.commit(parseScene(raw))
  }
  serialize(): string {
    return JSON.stringify(this.current, null, 2)
  }
}
