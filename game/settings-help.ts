/** Read-only English cheatsheet. No runtime subscriptions or saved preferences. */
export function createEngineHelp(doc: Document): HTMLElement {
  const section = doc.createElement('fieldset')
  section.id = 'settings-help'
  section.className = 'menu-section settings-help'
  section.lang = 'en'
  const legend = doc.createElement('legend')
  legend.textContent = 'Nabla Engine · quick guide'
  const intro = doc.createElement('p')
  intro.className = 'settings-help-intro'
  intro.textContent =
    'Nabla Engine is a browser-based 3D engine for interactive worlds: geographic terrain, physics, vehicles, characters and shared play. Euskadi Online is one application built with it.'
  section.append(legend, intro)
  const groups: ReadonlyArray<readonly [string, ReadonlyArray<readonly [string, string]>]> = [
    [
      'Find your way',
      [
        [
          'Main',
          'Choose a scenario, inspect system information and find controls for your current vehicle. VR/AR entries appear when available.',
        ],
        [
          'World',
          'Choose terrain, location and time. Adjust environment layers, weather and objects.',
        ],
        [
          'Settings',
          'Tune video, cameras, controls, player, weapons, simulation and audio. Manage saved preferences under Data and preferences.',
        ],
        [
          'Development',
          'Inspect collisions and terrain diagnostics. These tools are for troubleshooting.',
        ],
      ],
    ],
    [
      'Quick start',
      [
        [
          'Explore',
          'Use search to find a setting. Selecting a result opens its section without changing its value.',
        ],
        [
          'Controls',
          'Open Settings → Controls for the current keyboard bindings and input preferences. Bindings depend on the active context.',
        ],
        [
          'Navigate',
          'Use the arrow keys on the tab bar; Home and End jump to its ends. Escape closes the menu. On small screens, use the section selector above the content.',
        ],
        [
          'Tune',
          'Start with a Quality profile. Longer distances and higher resolution increase GPU cost. Settings that need a reload say so.',
        ],
        [
          'Keep your setup',
          'Use Settings management to back up or restore preferences. Copy report in Main → Info copies diagnostics, not a backup.',
        ],
      ],
    ],
    [
      'Know the boundaries',
      [
        [
          'Content',
          'Available terrain, vehicles and experiences depend on the host and scenario. Missing map cells are not always connection errors.',
        ],
        [
          'Devices',
          'WebGL is the default. WebGPU and XR support depend on the browser, device and effect. Main → Info reports the actual renderer.',
        ],
        [
          'Shared play',
          'Multiplayer needs a relay. It synchronizes participants and shared state; it is not a fully server-simulated physical world.',
        ],
      ],
    ],
  ]
  for (const [title, entries] of groups) {
    const heading = doc.createElement('h3')
    heading.textContent = title
    const list = doc.createElement('dl')
    for (const [name, description] of entries) {
      const term = doc.createElement('dt')
      term.textContent = name
      const detail = doc.createElement('dd')
      detail.textContent = description
      list.append(term, detail)
    }
    section.append(heading, list)
  }
  return section
}
