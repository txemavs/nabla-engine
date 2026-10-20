import { interfaceControls, interfaceTheme, interfaceVariables } from './interface-theme.js'

/**
 * Default HTML chrome of the engine: the quiet monochrome look first shipped by Euskadi Online
 * (36 px controls, 2 px radius, dark buttons, thin grey lines). Hosts add only branding and texts
 * on top. Layout positions stay with each component; this sheet only skins them.
 */
export const defaultInterfaceStyles = `
:root { ${interfaceVariables} --nabla-control-edge:20px; --nabla-control-bottom:60px; }
.game-toolbar button { ${interfaceControls} display:flex;align-items:center;justify-content:center;gap:6px;height:36px;min-width:36px;padding:0 8px;font:700 14px/1 Arial,sans-serif;cursor:pointer;touch-action:manipulation; }
.game-toolbar button:hover:not(:disabled),.game-toolbar button:active:not(:disabled) { background:${interfaceTheme.pressed}; }
.game-toolbar button:focus-visible { outline:2px solid var(--muted);outline-offset:2px; }
.game-toolbar button[aria-pressed="true"] { color:var(--accent);border-color:var(--accent); }
.game-toolbar .nabla-slider-panel { background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius);font:14px Arial,sans-serif;box-shadow:none; }
.touch-driving .touch-driving-stack { position:fixed!important;left:var(--nabla-control-edge)!important;right:auto!important;bottom:var(--nabla-control-bottom)!important; }
.touch-walk { position:fixed!important;inset:auto 0 var(--nabla-control-bottom)!important;padding:0 var(--nabla-control-edge)!important; }
.touch-flight { position:fixed!important;inset:auto var(--nabla-control-edge) var(--nabla-control-bottom)!important;width:auto!important; }
.touch-driving .touch-driving-wheel { right:var(--nabla-control-edge)!important;bottom:var(--nabla-control-bottom)!important; }
:is(.touch-walk-knob,.touch-flight-knob,.touch-driving-knob,.touch-driving-hb-dot),.touch-driving-lever.is-on .touch-driving-hb-dot { background:var(--button)!important;border:1px solid var(--line)!important;box-shadow:none!important;box-sizing:border-box; }
.touch-driving-knob { border-radius:var(--radius)!important; }
.touch-driving-turbo { display:none!important; }
.touch-driving-gas { height:160px!important; }
:is(.touch-walk-well,.touch-flight-stick) { background:#16161666!important;border-color:#4448!important;box-shadow:none!important; }
.touch-flight-label { color:#888!important; }
.touch-driving-rail { background:#4448!important; }
.touch-driving-rim { border-color:#252525!important;background:linear-gradient(90deg,transparent 46%,#252525 46%,#252525 54%,transparent 54%)!important;box-shadow:none!important; }
.touch-driving-pilot-ring { border-color:#4448!important;box-shadow:none!important; }
.touch-flight button { ${interfaceControls} min-height:36px;min-width:36px;width:36px;height:36px;padding:0; }
.touch-flight button:active { background:${interfaceTheme.pressed}!important; }
:is(.touch-walk-well,.touch-flight-stick):active > i,.touch-driving-gas:active > .touch-driving-knob,.touch-driving-lever:active .touch-driving-hb-dot { background:${interfaceTheme.pressed}!important; }
@media(max-width:600px) { :root { --nabla-control-edge:8px; --nabla-control-bottom:52px; } }
`

/** Add the default chrome once per document (idempotent; hosts may override after it). */
export function installInterfaceStyles(doc: Document | undefined = globalThis.document): void {
  if (!doc?.head || doc.getElementById('nabla-interface-style')) return
  const style = doc.createElement('style')
  style.id = 'nabla-interface-style'
  style.textContent = defaultInterfaceStyles
  doc.head.prepend(style)
}
