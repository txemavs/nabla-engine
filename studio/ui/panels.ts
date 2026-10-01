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
  for (const id of ['layer-terrain', 'layer-trees', 'layer-buildings', 'lamp-level', 'lamp-reach'])
    leaf(layers[0].node, id)
  for (const id of ['layer-relief', 'layer-z14', 'layer-z12', 'layer-maps'])
    leaf(layers[1].node, id)
  for (const id of ['layer-sky', 'layer-sun', 'layer-planets', 'layer-sea', 'layer-catch'])
    leaf(layers[2].node, id)
  leaf(layers[3].node, 'layer-grid')
  move(layers[4].node, 'drape-layers')
  const tint = (id: string, color: string, child = false) => {
    const label = get(id).closest('label')
    if (!label) return
    label.classList.add('layer-leaf')
    label.classList.toggle('layer-child', child)
    label.style.setProperty('--layer', color)
    const box = label.querySelector<HTMLInputElement>('input[type=checkbox]')
    if (box) label.prepend(box)
  }
  tint('layer-terrain', '#b08968')
  tint('layer-trees', '#3c9a55')
  tint('layer-buildings', '#c9845a')
  tint('layer-lamps', '#f0d080')
  tint('lamp-reach', '#f0d080', true)
  tint('layer-relief', '#7aa2ff')
  tint('layer-z14', '#d5d8e0')
  tint('layer-z12', '#9aa3b5')
  tint('layer-maps', '#6eb7e0')
  tint('layer-sky', '#8ec5ff')
  tint('layer-sun', '#ffd27a')
  tint('layer-planets', '#c9b6ff')
  tint('layer-sea', '#1f8a9a')
  tint('layer-catch', '#8b8e91')
  tint('layer-grid', '#b7bdc7')
  const drapeColor: Record<string, string> = {
    roofs: '#c9845a',
    runways: '#d0d4dc',
    pitches: '#6f9e4e',
    farmland: '#c6b15a',
    forest: '#2f7a45',
    grass: '#8fbf6a',
    scrub: '#a3a05a',
    terrain: '#b08968',
    residential: '#d07a8a',
    industrial: '#c47a9a',
    sand: '#e4d2a4',
    rock: '#9a9590',
    wetland: '#6a9a8a',
    water: '#3a8eb0',
    roads: '#f4f4f4',
  }
  for (const box of layers[4].node.querySelectorAll<HTMLInputElement>('input[data-drape]')) {
    const label = box.closest('label')
    if (!label) continue
    label.classList.add('layer-leaf')
    label.style.setProperty('--layer', drapeColor[box.dataset.drape ?? ''] ?? '#aaa')
    label.prepend(box)
  }
  const interfaceTab = {
    id: 'interface',
    label: 'Interfaz',
    sections: [section('presentation', 'Presentación')],
  }
  interfaceTab.sections[0].node.textContent =
    'Arrastra las pestañas para organizar los paneles. Ver permite recuperarlos y restablecer la distribución.'
  const content = (source: string, target: HTMLElement) => {
    for (const child of [...get(source).children])
      if (child.tagName !== 'SUMMARY') target.append(child)
  }
  const planetClock = section('planet-clock', 'Reloj')
  const skyLayers = section('planet-sky', 'Cielo')
  const place = section('location', 'Ubicación', false)
  const sea = section('sea', 'Mar', false)
  content('sky-section', planetClock.node)
  leaf(skyLayers.node, 'layer-clouds')
  const cloudStyleLabel = document.querySelector('label[for="cloud-style"]')
  if (cloudStyleLabel) skyLayers.node.append(cloudStyleLabel)
  skyLayers.node.append(get('cloud-style'))
  const cloudAmountLabel = document.querySelector('label[for="cloud-amount"]')
  if (cloudAmountLabel) skyLayers.node.append(cloudAmountLabel)
  skyLayers.node.append(get('cloud-amount'))
  const cloudStormLabel = document.querySelector('label[for="cloud-storm"]')
  if (cloudStormLabel) skyLayers.node.append(cloudStormLabel)
  skyLayers.node.append(get('cloud-storm'))
  const moonSizeLabel = document.querySelector('label[for="moon-size"]')
  if (moonSizeLabel) skyLayers.node.append(moonSizeLabel)
  skyLayers.node.append(get('moon-size'))
  for (const id of [
    'project-places',
    'project-place-open',
    'travel-city',
    'travel-form',
    'travel-status',
    'travel-cancel',
    'locate',
    'css-screen-demo',
  ]) {
    const node = get(id)
    const label = document.querySelector(`label[for="${id}"]`)
    if (label) place.node.append(label)
    place.node.append(node)
  }
  const layerSource = get('options-panel-layers')
  let moving = false
  for (const child of [...layerSource.children]) {
    if (child instanceof HTMLLabelElement && child.htmlFor === 'water-mode') moving = true
    if (child.classList.contains('eyebrow')) moving = false
    if (moving) sea.node.append(child)
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
    planetSections: [planetClock, skyLayers, place, sea],
    preferences: [interfaceTab, performance, storage, development],
    help,
    parking,
  }
}
