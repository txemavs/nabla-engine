import { Vector3, Quaternion } from 'three'
import {
  createEntity,
  parseScene,
  replaceMapScene,
  updateSceneEntity,
  SceneGraph,
  type Entity,
  type Vec3Tuple,
  type SceneDocument,
} from './scene.js'

/** Transactions store authored data only. Physics never writes into this history. */
export class SceneEditor {
  private current: SceneDocument
  private past: SceneDocument[] = []
  private future: SceneDocument[] = []
  constructor(
    document: SceneDocument,
    public experimentalLargeScene = false,
  ) {
    this.current = parseScene(document, this.experimentalLargeScene)
  }
  /** Internal ownership transfer from a validating worker; never use with untrusted raw input. */
  static fromValidated(document: SceneDocument, large = false): SceneEditor {
    const editor = Object.create(SceneEditor.prototype) as SceneEditor
    editor.current = document
    editor.past = []
    editor.future = []
    editor.experimentalLargeScene = large
    return editor
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
    const checked = parseScene(next, this.experimentalLargeScene)
    if (JSON.stringify(checked) === JSON.stringify(this.current)) return
    this.past.push(this.current)
    if (this.past.length > 100) this.past.shift()
    this.current = checked
    this.future = []
  }
  /** Streaming is environmental data, not an authored undo step. */
  replaceMapEntities(remove: Set<string>, add: Entity[]): void {
    const additions = structuredClone(add)
    const apply = (doc: SceneDocument): SceneDocument => ({
      ...doc,
      entities: [...doc.entities.filter((e) => !remove.has(e.id)), ...additions],
    })
    const origin = this.current.geography
    const sameWorld = (doc: SceneDocument) =>
      doc.entities.some((e) => e.id === 'world-terrain') &&
      doc.geography?.latitude === origin?.latitude &&
      doc.geography?.longitude === origin?.longitude &&
      doc.geography?.altitude === origin?.altitude
    this.current = replaceMapScene(this.current, remove, additions, this.experimentalLargeScene)
    this.past = this.past.map((doc) => (sameWorld(doc) ? apply(doc) : doc))
    this.future = this.future.map((doc) => (sameWorld(doc) ? apply(doc) : doc))
  }
  update(id: string, patch: Partial<Omit<Entity, 'id' | 'parentId'>>): void {
    const next = updateSceneEntity(this.current, id, patch)
    if (next === this.current) return
    this.past.push(this.current)
    if (this.past.length > 100) this.past.shift()
    this.current = next
    this.future = []
  }
  /** An isolated entity snapshot, without copying the entire map. */
  entity(id: string): Entity {
    const entity = this.current.entities.find((e) => e.id === id)
    if (!entity) throw new Error('Unknown entity: ' + id)
    return structuredClone(entity)
  }

  add(kind: Entity['kind']): string {
    const next = this.document,
      id = crypto.randomUUID()
    next.entities.push(createEntity(id, kind, next.cursor ?? [0, 0, 0]))
    this.commit(next)
    return id
  }
  setCursor(position: Vec3Tuple): void {
    this.commit({ ...this.document, cursor: position })
  }
  moveToCursor(id: string): void {
    const next = this.document,
      graph = SceneGraph.fromValidated(parseScene(next, this.experimentalLargeScene))
    const entity = next.entities.find((e) => e.id === id)
    if (!entity) throw new Error('Select an object')
    const world = graph.worldTransform(id)
    world.position = next.cursor ?? [0, 0, 0]
    entity.transform = graph.localFromWorld(entity.parentId, world)
    this.commit(next)
  }
  /** Rebase editable vertices and direct children without moving their world geometry. */
  originToCursor(id: string): void {
    const next = this.document,
      graph = SceneGraph.fromValidated(parseScene(next, this.experimentalLargeScene))
    const entity = next.entities.find((e) => e.id === id)
    if (!entity?.geometry || entity.visual || entity.road)
      throw new Error('El origen se ajusta en sólidos editables')
    const old = graph.worldTransform(id)
    const world = { ...old, position: next.cursor ?? ([0, 0, 0] as Vec3Tuple) }
    const offset = new Vector3(...world.position)
      .sub(new Vector3(...old.position))
      .applyQuaternion(new Quaternion(...old.rotation).invert())
    const children = next.entities
      .filter((e) => e.parentId === id)
      .map((e) => ({ entity: e, world: graph.worldTransform(e.id) }))
    entity.geometry.vertices = entity.geometry.vertices.map((p) =>
      new Vector3(...p).sub(offset).toArray(),
    )
    entity.transform = graph.localFromWorld(entity.parentId, world)
    const after = SceneGraph.fromValidated(parseScene(next, this.experimentalLargeScene))
    for (const child of children) child.entity.transform = after.localFromWorld(id, child.world)
    this.commit(next)
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
    for (const copy of copies)
      if (copy.portal) {
        const pairId = copy.portal.pairId ? remap.get(copy.portal.pairId) : undefined
        copy.portal = {
          ...copy.portal,
          pairId: pairId ?? null,
          mode: pairId ? copy.portal.mode : 'closed',
        }
      }
    for (const copy of copies)
      if (copy.road && remap.has(copy.road.terrainId))
        copy.road.terrainId = remap.get(copy.road.terrainId)!
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
    for (const entity of next.entities)
      if (entity.portal?.pairId && removed.has(entity.portal.pairId))
        entity.portal = { ...entity.portal, pairId: null, mode: 'closed' }
    this.commit(next)
  }
  linkPortals(id: string, pairId: string | null): void {
    const next = this.document
    const mouth = next.entities.find((e) => e.id === id)
    const pair = pairId === null ? null : next.entities.find((e) => e.id === pairId)
    if (!mouth?.portal || (pairId !== null && (!pair?.portal || pair.id === id)))
      throw new Error('Choose two distinct portals')
    for (const end of [mouth, pair]) {
      if (!end?.portal) continue
      const old = next.entities.find((e) => e.id === end.portal!.pairId)
      if (old?.portal) old.portal = { ...old.portal, pairId: null, mode: 'closed' }
      end.portal = { ...end.portal, pairId: null, mode: 'closed' }
    }
    if (pair?.portal) {
      mouth.portal = { ...mouth.portal, pairId: pair.id, mode: 'closed' }
      pair.portal = { ...pair.portal, pairId: mouth.id, mode: 'closed' }
    }
    this.commit(next)
  }
  setPortalMode(id: string, mode: 'closed' | 'window' | 'open'): void {
    const next = this.document
    const mouth = next.entities.find((e) => e.id === id)
    if (!mouth?.portal) throw new Error('Select a portal')
    mouth.portal.mode = mode
    const pair = next.entities.find((e) => e.id === mouth.portal!.pairId)
    if (pair?.portal) pair.portal.mode = mode
    this.commit(next)
  }
  reparent(id: string, parentId: string | null): void {
    const next = this.document,
      graph = SceneGraph.fromValidated(parseScene(next, this.experimentalLargeScene))
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
    this.commit(parseScene(raw, this.experimentalLargeScene))
  }
  serialize(): string {
    return JSON.stringify(this.current)
  }
}
