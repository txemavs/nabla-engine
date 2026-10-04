import type { PropertyField } from '@nabla/desktop/core'
import { Quaternion, Vector3 } from 'three'
import { SceneGraph } from '@nabla/engine'
import type { SceneDocument } from '@nabla/engine'
import { isMapEnvironment } from '../outliner.js'
import type { InspectorContext } from './properties.js'
import { axisLocked } from './properties.js'
import { capabilityOpen, capabilityTitle, capabilitySections } from './state.js'
export function relativeTransform(
  doc: SceneDocument,
  id: string,
  operation: string,
  space: string,
  axis: number,
  amount: number,
) {
  if (!Number.isFinite(amount) || ![0, 1, 2].includes(axis))
    throw new Error('Cantidad o eje no válido')
  const entity = doc.entities.find((e) => e.id === id)!
  const graph = SceneGraph.fromValidated(doc)
  const pose = graph.worldTransform(id)
  const rotation = new Quaternion(...pose.rotation)
  const direction = new Vector3().setComponent(axis, 1)
  if (operation === 'rotate') {
    const delta = new Quaternion().setFromAxisAngle(direction, (amount * Math.PI) / 180)
    pose.rotation = (
      space === 'local' ? rotation.multiply(delta) : rotation.premultiply(delta)
    ).toArray()
  } else {
    if (space === 'local') direction.applyQuaternion(rotation)
    pose.position = new Vector3(...pose.position).addScaledVector(direction, amount).toArray()
  }
  return graph.localFromWorld(entity.parentId, pose)
}
export function openExactTransform(c: InspectorContext) {
  let operation = 'translate',
    space = 'local',
    axis = '0',
    amount = 1
  const baseline = c.editor.serialize()
  const disabled = c.disabled || (isMapEnvironment(c.entity) && !c.entity.mapEditable)
  capabilityTitle.value = 'Transformar · ' + c.entity.name
  capabilitySections.value = [
    {
      id: 'exact-transform',
      label: 'Transformación relativa',
      note: 'Desplazamiento en metros o giro en grados, sobre el objeto seleccionado. Global usa los ejes de la escena; el giro conserva el origen del objeto.',
      fields: (
        [
          {
            id: 'exact-operation',
            label: 'Operación',
            type: 'select',
            value: operation,
            options: [
              { value: 'translate', label: 'Desplazar · m' },
              { value: 'rotate', label: 'Girar · °' },
            ],
            change: (v) => {
              operation = String(v)
            },
          },
          {
            id: 'exact-space',
            label: 'Coordenadas',
            type: 'select',
            value: space,
            options: [
              { value: 'local', label: 'Locales del objeto' },
              { value: 'global', label: 'Globales de la escena' },
            ],
            change: (v) => {
              space = String(v)
            },
          },
          {
            id: 'exact-axis',
            label: 'Eje',
            type: 'select',
            value: axis,
            options: ['X', 'Y', 'Z'].map((label, i) => ({ value: String(i), label })),
            change: (v) => {
              axis = String(v)
            },
          },
          {
            id: 'exact-amount',
            label: 'Cantidad',
            type: 'number',
            value: amount,
            change: (v) => {
              amount = Number(v)
            },
          },
        ] satisfies PropertyField[]
      ).map((field) => ({ ...field, disabled })),
      actions: [
        {
          id: 'apply-transform',
          label: 'Aplicar',
          disabled,
          execute: () => {
            if (c.canEdit?.() === false)
              throw new Error('Detén la prueba antes de transformar el objeto.')
            if (c.editor.serialize() !== baseline)
              throw new Error(
                'El objeto o la escena han cambiado. Cierra y vuelve a abrir Transformar.',
              )
            if (operation === 'translate' && [0, 1, 2].some((i) => axisLocked(c.entity.id, i)))
              throw new Error(
                'Desbloquea la posición del objeto antes de aplicar una transformación relativa.',
              )
            c.editor.update(c.entity.id, {
              transform: relativeTransform(
                c.editor.document,
                c.entity.id,
                operation,
                space,
                Number(axis),
                amount,
              ),
            })
            c.finishPose(c.entity.id)
            capabilityOpen.value = false
          },
        },
        {
          id: 'cancel-transform',
          label: 'Cancelar',
          execute: () => {
            capabilityOpen.value = false
          },
        },
      ],
    },
  ]
  capabilityOpen.value = true
}
