import type { PropertyField, PropertySection } from '@nabla/desktop/core'
import { SceneGraph } from '../../src/scene/graph.js'
import type { SceneDocument } from '../../src/scene/document.js'
import { toDegrees, rotationDegrees, type Entity, type Vec3Tuple } from '../../src/entity/schema.js'
import type { SceneEditor } from '../../src/scene/history.js'
import { geographicPose, anchoredWorldPose } from '../geographic-pose.js'
import { isMapEnvironment } from '../outliner.js'
import { entityCapabilities } from '../../src/entity/capability.js'
import { capabilityOpen, capabilityTitle, capabilitySections, inspector } from './state.js'
export const axisLocks = new Map<string, Set<number>>()
export const axisLocked = (id: string, axis: number) => axisLocks.get(id)?.has(axis) ?? false
export interface InspectorContext {
  doc: SceneDocument
  entity: Entity
  editor: SceneEditor
  disabled: boolean
  canEdit?: () => boolean
  refresh: () => void
  rebuild: () => void
  finishPose: (id: string) => void
  locksChanged: () => void
}
const names: Record<string, string> = {
  drive: 'Vehículo',
  fly: 'Vuelo',
  interior: 'Interior',
  dock: 'Garaje',
  portal: 'Portal',
  sprite: 'Sprite',
  light: 'Iluminación',
  'solid-edit': 'Geometría',
}
export function objectProperties(c: InspectorContext): PropertySection[] {
  const e = c.entity,
    readOnly = isMapEnvironment(e) && !e.mapEditable,
    disabled = c.disabled || readOnly
  const patch = (value: Partial<Entity>) => {
    if (c.canEdit?.() === false) throw new Error('Detén la prueba antes de editar el objeto.')
    c.editor.update(e.id, value)
    c.rebuild()
  }
  const field = (
    id: string,
    label: string,
    value: string | number | boolean,
    type: PropertyField['type'] = 'text',
    change: PropertyField['change'] = () => {},
  ): PropertyField => ({ id, label, value, type, disabled, change })
  const info: PropertySection = {
    id: 'information',
    label: 'Información',
    fields: [
      field('name', 'Nombre', e.name, 'text', (v) => patch({ name: String(v) })),
      { ...field('entity-id', 'Identificador', e.id), readonly: true },
      { ...field('entity-kind', 'Clase', e.kind), readonly: true },
    ],
  }
  const ancestry = [e]
  let ancestor = e
  const byId = new Map(c.doc.entities.map((x) => [x.id, x]))
  while (ancestor.parentId) {
    ancestor = byId.get(ancestor.parentId)!
    ancestry.push(ancestor)
  }
  const graph = SceneGraph.fromValidated({ ...c.doc, entities: ancestry }),
    parent = byId.get(e.parentId ?? '')
  const geographic =
    c.doc.geography && (!parent || (isMapEnvironment(parent) && !parent.mapEditable))
      ? geographicPose(c.doc.geography, graph.worldTransform(e.id), e.geoAnchor)
      : undefined
  const pose = geographic?.pose ?? e.transform,
    angles = toDegrees(pose.rotation)
  const position: PropertySection = { id: 'position', label: 'Situación', fields: [] }
  position.fields!.push({
    ...field('parent', 'Padre', e.parentId ?? '', 'select', (v) => {
      c.editor.reparent(e.id, String(v) || null)
      c.rebuild()
    }),
    disabled: disabled || e.kind === 'spawn' || e.motion === 'dynamic' || !!e.portal,
    options: [
      { value: '', label: 'Mundo' },
      ...c.doc.entities
        .filter(
          (x) =>
            x.id !== e.id &&
            x.kind !== 'spawn' &&
            (!isMapEnvironment(x) || x.mapEditable || x.id === e.parentId),
        )
        .map((x) => ({ value: x.id, label: x.name })),
    ],
  })
  if (c.doc.geography) {
    const anchor =
      geographic?.anchor ?? geographicPose(c.doc.geography, graph.worldTransform(e.id)).anchor
    for (const [key, label] of [
      ['latitude', 'Latitud'],
      ['longitude', 'Longitud'],
      ['altitude', 'Altitud'],
    ] as const)
      position.fields!.push({
        ...field(
          'entity-' + key,
          label,
          Number(anchor[key].toFixed(key === 'altitude' ? 3 : 8)),
          'number',
          (v) => {
            if (!geographic) return
            const next = { ...anchor, [key]: Number(v) }
            c.editor.update(e.id, {
              ...(e.geoAnchor ? { geoAnchor: next } : {}),
              transform: graph.localFromWorld(
                e.parentId,
                anchoredWorldPose(c.doc.geography!, next, geographic.pose),
              ),
            })
            c.finishPose(e.id)
          },
        ),
        readonly: !geographic,
        step: key === 'altitude' ? 0.1 : 0.000001,
        unit: key === 'altitude' ? 'm' : '°',
      })
  }
  function vector(key: 'position' | 'rotation' | 'size', values: Vec3Tuple, label: string) {
    return values.map((value, i) => ({
      ...field(`${key}-${i}`, `${label} ${'XYZ'[i]}`, Number(value.toFixed(4)), 'number', (v) => {
        const next = [...values] as Vec3Tuple
        next[i] = Number(v)
        if (key === 'size') {
          patch({ size: next })
          return
        }
        const change = key === 'rotation' ? rotationDegrees(...next) : next
        if (geographic)
          c.editor.update(e.id, {
            ...(key === 'position' ? { geoAnchor: geographic.anchor } : {}),
            transform: graph.localFromWorld(
              e.parentId,
              anchoredWorldPose(c.doc.geography!, geographic.anchor, { ...pose, [key]: change }),
            ),
          })
        else c.editor.update(e.id, { transform: { ...e.transform, [key]: change } })
        c.finishPose(e.id)
      }),
      unit: key === 'rotation' ? '°' : 'm',
      readonly: key === 'size' && !!e.visual,
      ...(key === 'position'
        ? {
            locked: axisLocked(e.id, i),
            toggleLock: () => {
              const locks = axisLocks.get(e.id) ?? new Set<number>()
              if (locks.has(i)) locks.delete(i)
              else locks.add(i)
              axisLocks.set(e.id, locks)
              c.locksChanged()
              c.refresh()
            },
          }
        : {}),
    }))
  }
  position.fields!.push(
    ...vector('position', pose.position, 'Posición'),
    ...vector('rotation', angles, 'Rotación'),
  )
  const result = [info, position]
  if (['box', 'vehicle'].includes(e.kind) || e.sprite)
    result.push({
      id: 'dimensions',
      label: 'Dimensiones',
      fields: vector('size', e.size, 'Tamaño'),
    })
  if (!e.visual || ['nabla.s3', 'nabla.wrangler'].includes(e.visual.presentation ?? ''))
    result.push({
      id: 'appearance',
      label: 'Apariencia',
      fields: [field('color', 'Color', e.color, 'color', (v) => patch({ color: String(v) }))],
    })
  if (e.kind === 'vehicle' && e.visual) {
    const current = e.visual.presentation ?? ''
    const options = [
      { value: '', label: 'Sin equipamiento' },
      { value: 'nabla.s3', label: 'S3 · luces, cuadro y espejos' },
      { value: 'nabla.police', label: 'Policía Bilbao · decoración y sirena' },
      { value: 'nabla.wrangler', label: 'Wrangler · pintura y cristales' },
    ]
    if (!options.some((option) => option.value === current))
      options.push({ value: current, label: current })
    result.push({
      id: 'vehicle-presentation',
      label: 'Equipamiento visual',
      note: 'Selecciona el equipamiento correspondiente al modelo. No modifica la física ni la posición.',
      fields: [
        {
          ...field('vehicle-presentation', 'Equipamiento', current, 'select', (value) => {
            const visual = { ...e.visual! }
            if (value) visual.presentation = String(value)
            else delete visual.presentation
            patch({ visual })
          }),
          options,
        },
      ],
    })
  }
  if (e.kind === 'box' || e.motion === 'dynamic') {
    const fields: PropertyField[] = []
    if (e.kind === 'box')
      fields.push({
        ...field('motion', 'Comportamiento', e.motion, 'select', (v) =>
          patch({ motion: v as Entity['motion'] }),
        ),
        options: [
          { value: 'static', label: 'Fijo' },
          { value: 'dynamic', label: 'Móvil' },
          { value: 'none', label: 'Solo visual' },
        ],
      })
    if (e.motion === 'dynamic')
      fields.push({
        ...field('mass', 'Masa', e.mass, 'number', (v) => patch({ mass: Number(v) })),
        unit: 'kg',
        min: 0.1,
        max: 100000,
      })
    result.push({ id: 'physics', label: 'Física', fields })
  }
  for (const capability of entityCapabilities(e)) {
    if (['drive', 'fly', 'interior', 'dock'].includes(capability))
      result.push({
        id: capability,
        label: names[capability],
        actions: [
          {
            id: 'configure-' + capability,
            label: 'Configurar ' + names[capability] + '…',
            disabled,
            execute: () => openCapability(c, capability),
          },
        ],
      })
  }
  if (e.light) {
    const light = e.light
    result.push({
      id: 'light',
      label: 'Iluminación',
      fields: Object.entries(light).map(([key, value]) =>
        field(
          'light-' + key,
          (
            {
              enabled: 'Encendida',
              nightOnly: 'Solo de noche',
              color: 'Color',
              intensity: 'Intensidad · cd',
              distance: 'Alcance · m',
            } as Record<string, string>
          )[key] ?? key,
          value,
          typeof value === 'boolean' ? 'checkbox' : typeof value === 'number' ? 'number' : 'color',
          (v) => patch({ light: { ...light, [key]: v } }),
        ),
      ),
    })
  }
  if (e.sprite)
    result.push({
      id: 'sprite',
      label: 'Sprite',
      fields: [
        field('sprite-url', 'Imagen PNG', e.sprite.url, 'text', (v) =>
          patch({ sprite: { ...e.sprite!, url: String(v) } }),
        ),
      ],
    })
  if (e.source)
    result.push({
      id: 'osm',
      label: 'Objeto OSM',
      fields: [
        {
          ...field('osm-source', 'Datos de origen', JSON.stringify(e.source, null, 2), 'textarea'),
          readonly: true,
        },
      ],
    })
  if (readOnly)
    result.push({
      id: 'map',
      label: 'Objeto del mapa',
      note: 'Crea una modificación para editar este objeto.',
      actions: [
        {
          id: 'make-building-editable',
          label: 'Crear modificación',
          disabled: c.disabled,
          execute: () => patch({ mapEditable: true }),
        },
      ],
    })
  return result
}
export function openCapability(c: InspectorContext, capability = 'drive') {
  const e = c.entity
  if (!e.vehicle) return
  const baseline = c.editor.serialize()
  const draft = structuredClone(e.vehicle)
  const labels: Record<string, string> = {
    wheelRadius: 'Radio de rueda',
    engineForce: 'Fuerza del motor',
    brakeForce: 'Frenado',
    stiffness: 'Rigidez',
    suspensionRest: 'Reposo de suspensión',
    suspensionTravel: 'Recorrido de suspensión',
    cameraDistance: 'Distancia de cámara',
    drivenWheels: 'Tracción',
    powerCv: 'Potencia',
    torqueNm: 'Par',
    powertrain: 'Transmisión',
    finalDrive: 'Relación final',
    grip: 'Adherencia',
    ratios: 'Relaciones de cambio',
    hubs: 'Centros de rueda',
    colliders: 'Colisiones',
    driver: 'Conductor',
    headOffset: 'Posición de ojos',
    mirrorTilt: 'Inclinación de espejos',
    min: 'Mínimo',
    max: 'Máximo',
    exit: 'Salida',
    ramp: 'Rampa',
    colliderIndex: 'Índice de colisión',
    hinge: 'Bisagra',
    closeAngle: 'Ángulo de cierre',
    position: 'Posición',
    rotation: 'Rotación',
    size: 'Dimensiones',
    halfExtents: 'Semiextensiones',
    offset: 'Desplazamiento',
    center: 'Centro',
    flight: 'Vuelo habilitado',
    plane: 'Vuelo de avión',
    boat: 'Navegación acuática',
  }
  const units: Record<string, string> = {
    wheelRadius: 'm',
    suspensionRest: 'm',
    suspensionTravel: 'm',
    cameraDistance: 'm',
    engineForce: 'N',
    powerCv: 'CV',
    torqueNm: 'N·m',
    mirrorTilt: '°',
    closeAngle: 'rad',
  }
  const sections: PropertySection[] = []
  function section(id: string, label: string, entries: [string, unknown][], owner: object = draft) {
    const fields: PropertyField[] = []
    function visit(value: object, entries: [string, unknown][], path: string[] = []) {
      for (const [key, entry] of entries) {
        const at = [...path, key]
        if (entry && typeof entry === 'object') visit(entry, Object.entries(entry), at)
        else if (['number', 'boolean', 'string'].includes(typeof entry))
          fields.push({
            id: 'cap-' + at.join('-'),
            label: at
              .map((k) => labels[k] ?? (/^\d+$/.test(k) ? String(Number(k) + 1) : k))
              .join(' / '),
            type:
              key === 'drivenWheels'
                ? 'select'
                : typeof entry === 'boolean'
                  ? 'checkbox'
                  : typeof entry === 'number'
                    ? 'number'
                    : 'text',
            value: entry as string | number | boolean,
            unit: units[key],
            disabled: c.disabled,
            readonly: ['flight', 'plane', 'boat'].includes(key),
            options:
              key === 'drivenWheels'
                ? [
                    { value: 'front', label: 'Delantera' },
                    { value: 'rear', label: 'Trasera' },
                    { value: 'all', label: 'Integral' },
                  ]
                : undefined,
            change: (v) => {
              ;(value as Record<string, unknown>)[key] = v
            },
          })
      }
    }
    visit(owner, entries)
    if (fields.length) sections.push({ id, label, fields })
  }
  const entries = Object.entries(draft)
  if (capability === 'interior' && draft.interior)
    section('interior', 'Interior', Object.entries(draft.interior), draft.interior)
  else if (capability === 'dock' && draft.garage)
    section('garage', 'Garaje y rampa', Object.entries(draft.garage), draft.garage)
  else if (capability === 'fly') {
    section(
      'flight',
      'Modo de vuelo',
      entries.filter(([k]) => ['flight', 'plane'].includes(k)),
    )
    sections.push({
      id: 'flight-note',
      label: 'Configuración de vuelo',
      note: 'Esta capacidad ya pertenece al objeto. El motor actual no expone parámetros independientes de vuelo en el documento. Su configuración física compartida se edita en Vehículo.',
    })
  } else {
    const groups: [string, string, string[]][] = [
      [
        'engine',
        'Motor y transmisión',
        ['engineForce', 'brakeForce', 'drivenWheels', 'powertrain'],
      ],
      [
        'wheels',
        'Ruedas y suspensión',
        ['wheelRadius', 'suspensionRest', 'suspensionTravel', 'stiffness', 'hubs'],
      ],
      ['body', 'Cuerpo y colisiones', ['colliders']],
      ['cockpit', 'Conductor y cámara', ['driver', 'headOffset', 'cameraDistance', 'mirrorTilt']],
    ]
    for (const [id, label, keys] of groups)
      section(
        id,
        label,
        entries.filter(([key]) => keys.includes(key)),
      )
  }
  sections.push({
    id: 'capability-actions',
    label: 'Cambios',
    note: 'Los cambios se guardan al aplicar. Cancelar descarta este borrador.',
    actions: [
      {
        id: 'apply-capability',
        label: 'Aplicar cambios',
        disabled: c.disabled,
        execute: () => {
          if (c.canEdit?.() === false) throw new Error('Detén la prueba antes de aplicar cambios.')
          if (c.editor.serialize() !== baseline)
            throw new Error(
              'La escena ha cambiado. Cierra y vuelve a abrir la capacidad para evitar sobrescribir cambios.',
            )
          c.editor.update(e.id, { vehicle: draft })
          c.rebuild()
          capabilityOpen.value = false
        },
      },
      {
        id: 'cancel-capability',
        label: 'Cancelar',
        execute: () => {
          capabilityOpen.value = false
        },
      },
    ],
  })
  capabilityTitle.value = (names[capability] ?? 'Vehículo') + ' · ' + e.name
  capabilitySections.value = sections
  capabilityOpen.value = true
}

export function chooseCapability(c: InspectorContext) {
  const sections = inspector.value.filter(
    (section) => !['information', 'position', 'dimensions', 'map'].includes(section.id),
  )
  capabilityTitle.value = 'Capacidades · ' + c.entity.name
  capabilitySections.value = [
    {
      id: 'capabilities',
      label: 'Capacidades',
      note: sections.length ? undefined : 'Este objeto solo tiene información y situación.',
      actions: sections.map((section) => ({
        id: 'edit-capability-' + section.id,
        label: section.label,
        disabled: c.disabled,
        execute: () => {
          if (['drive', 'fly', 'interior', 'dock'].includes(section.id)) {
            openCapability(c, section.id)
            return
          }
          capabilityTitle.value = section.label + ' · ' + c.entity.name
          capabilitySections.value = [
            {
              ...section,
              fields: section.fields?.map((field) => ({ ...field, id: 'capability-' + field.id })),
            },
          ]
        },
      })),
    },
  ]
  capabilityOpen.value = true
}
