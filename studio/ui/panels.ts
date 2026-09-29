export interface ContentSection {
  id: string
  label: string
  node: HTMLElement
  open?: boolean
}
export interface PreferencesTab {
  id: string
  label: string
  sections: ContentSection[]
}
const get = (id: string) => document.getElementById(id)!
/** Engine-owned controls keep their listeners; Vue owns panel/window lifecycles. */
export function preparePanels() {
  const parking = document.createElement('div')
  parking.id = 'studio-host-controls'
  parking.hidden = true
  document.body.append(parking)
  const section = (id: string, label: string, open = true): ContentSection => {
    const node = document.createElement('div')
    node.id = id
    parking.append(node)
    return { id, label, node, open }
  }
  const move = (parent: HTMLElement, ...ids: string[]) => {
    for (const id of ids) parent.append(get(id))
  }
  const leaf = (parent: HTMLElement, id: string) => parent.append(get(id).closest('label')!)
  const layers = [
    section('models', 'Modelos'),
    section('tiles', 'Teselas'),
    section('planet-layers', 'Planeta'),
    section('interface-layers', 'Interfaz'),
    section('projection', 'Proyección'),
  ]
  const layerActions = section('layer-actions', 'Visibilidad').node
  move(layerActions, 'layers-all', 'layers-none')
  for (const id of ['layer-glb', 'layer-trees', 'layer-lamps']) leaf(layers[0].node, id)
  for (const id of ['layer-relief', 'layer-z14', 'layer-z12', 'layer-maps'])
    leaf(layers[1].node, id)
  for (const id of ['layer-sky', 'layer-sun', 'layer-planets', 'layer-sea'])
    leaf(layers[2].node, id)
  leaf(layers[3].node, 'layer-grid')
  move(layers[4].node, 'drape-layers')
  const interfaceTab = {
    id: 'interface',
    label: 'Interfaz',
    sections: [section('presentation', 'Presentación')],
  }
  interfaceTab.sections[0].node.textContent =
    'Arrastra las pestañas para organizar los paneles. Ver permite recuperarlos y restablecer la distribución.'
  const planet = {
    id: 'planet',
    label: 'Planeta',
    sections: [
      section('planet-time', 'Sol y luna'),
      section('destinations', 'Destinos del planeta', false),
      section('location', 'Ubicación', false),
      section('sea', 'Mar', false),
    ],
  }
  const content = (source: string, target: HTMLElement) => {
    for (const child of [...get(source).children])
      if (child.tagName !== 'SUMMARY') target.append(child)
  }
  content('sky-section', planet.sections[0].node)
  move(planet.sections[1].node, 'project-places', 'project-place-open', 'travel-city')
  move(
    planet.sections[2].node,
    'travel-form',
    'travel-status',
    'travel-cancel',
    'locate',
    'css-screen-demo',
  )
  const layerSource = get('options-panel-layers')
  let moving = false
  for (const child of [...layerSource.children]) {
    if (child instanceof HTMLLabelElement && child.htmlFor === 'water-mode') moving = true
    if (child.classList.contains('eyebrow')) moving = false
    if (moving) planet.sections[3].node.append(child)
  }
  const performance = {
    id: 'performance',
    label: 'Rendimiento',
    sections: [section('engine', 'Motor')],
  }
  performance.sections[0].node.append(get('stream-mode').closest('.option-row')!)
  const storage = { id: 'storage', label: 'Almacenamiento', sections: [] as ContentSection[] }
  let destination: HTMLElement | undefined
  for (const child of [...get('performance-section').children]) {
    if (child.tagName === 'SUMMARY') continue
    if (child.classList.contains('eyebrow')) {
      const title = child.textContent!.trim(),
        s = section(
          'quality-' + title,
          title === 'IMAGEN' ? 'Imagen' : title === 'ALCANCE' ? 'Alcance' : 'Caché',
        )
      ;(title === 'MEMORIA' ? storage : performance).sections.push(s)
      destination = s.node
    } else destination?.append(child)
  }
  const development = {
    id: 'development',
    label: 'Desarrollo',
    sections: [section('diagnostics', 'Diagnóstico')],
  }
  content('diagnostics-section', development.sections[0].node)
  const help = [section('help-controls', 'Controles')]
  content('controls-section', help[0].node)
  // Menus are rendered from commands; retain engine-owned control nodes during migration.
  const oldMenus = document.querySelector('.app-menus')!
  parking.append(oldMenus)
  for (const id of [
    'file-menu',
    'options-menu',
    'travel-menu',
    'cursor-menu',
    'help-menu',
    'portal-registry',
  ]) {
    const node = get(id)
    if (node) parking.append(node)
  }
  const toolbar = document.querySelector('.toolbar')!
  parking.append(...toolbar.children)
  return {
    layers,
    layerActions,
    preferences: [interfaceTab, planet, performance, storage, development],
    help,
    parking,
  }
}
