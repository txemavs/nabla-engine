import { Matrix4, Object3D, Quaternion, Vector3 } from 'three'
import type { Transform } from '../entity/schema.js'
import {
  parseScene,
  type SceneDocument,
} from '../scene/document.js'

export {
  parseScene,
  replaceMapScene,
  updateSceneEntity,
} from '../scene/document.js'
export type { SceneDocument } from '../scene/document.js'

export {
  createEntity,
  isMapBuilding,
  rotationDegrees,
  toDegrees,
} from '../entity/schema.js'
export type {
  Entity,
  QuatTuple,
  Transform,
  Vec3Tuple,
  VehicleDefinition,
  VisualDefinition,
} from '../entity/schema.js'


const validatedGraph = Symbol('validated graph')

/** Rigid transforms only. Object dimensions are geometry, never inherited scale. */
export class SceneGraph {
  readonly root = new Object3D()
  private readonly nodes = new Map<string, Object3D>()
  /** Internal fast path: caller must have just validated this document with parseScene. */
  static fromValidated(document: SceneDocument): SceneGraph {
    return new SceneGraph(document, validatedGraph)
  }
  constructor(document: SceneDocument, token?: symbol) {
    const doc = token === validatedGraph ? document : parseScene(document)
    for (const e of doc.entities) {
      const node = new Object3D()
      node.name = e.id
      node.position.fromArray(e.transform.position)
      node.quaternion.fromArray(e.transform.rotation)
      this.nodes.set(e.id, node)
    }
    for (const e of doc.entities)
      (e.parentId ? this.node(e.parentId) : this.root).add(this.node(e.id))
    this.root.updateMatrixWorld(true)
  }
  private node(id: string): Object3D {
    const node = this.nodes.get(id)
    if (!node) throw new Error('Unknown entity: ' + id)
    return node
  }
  worldTransform(id: string): Transform {
    const node = this.node(id)
    return {
      position: node.getWorldPosition(new Vector3()).toArray(),
      rotation: node.getWorldQuaternion(new Quaternion()).toArray(),
    }
  }
  localFromWorld(parentId: string | null, pose: Transform): Transform {
    const world = new Matrix4().compose(
      new Vector3(...pose.position),
      new Quaternion(...pose.rotation),
      new Vector3(1, 1, 1),
    )
    if (parentId) {
      const parent = this.node(parentId)
      parent.updateWorldMatrix(true, false)
      world.premultiply(parent.matrixWorld.clone().invert())
    }
    const p = new Vector3(),
      q = new Quaternion(),
      s = new Vector3()
    world.decompose(p, q, s)
    return { position: p.toArray(), rotation: q.normalize().toArray() }
  }
}

