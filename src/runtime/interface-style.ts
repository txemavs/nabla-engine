import { interfaceControls, interfaceTheme, interfaceVariables } from './interface-theme.js'

/**
 * Default HTML chrome of the engine: the quiet monochrome look first shipped by Euskadi Online
 * (36 px controls, 2 px radius, dark buttons, thin grey lines). Hosts add only branding and texts
 * on top. Layout positions stay with each component; this sheet only skins them.
 */
export const defaultInterfaceStyles = `
:root { ${interfaceVariables} --nabla-control-edge:20px; --nabla-control-bottom:60px;
  --nabla-ui-scale:0.66; --nabla-ui-margin:12px; --nabla-btn-size:36px; --nabla-btn-gap:6px;
  /* On-screen size of one scaled button row, for unscaled text aligned to the button grid. */
  --nabla-ui-row:calc(var(--nabla-btn-size) * var(--nabla-ui-scale)); }
@media(pointer:coarse) { :root { --nabla-ui-scale:0.8; } }
@media(max-width:600px) { :root { --nabla-ui-margin:8px; } }
/* Corner anchors: every corner sits --nabla-ui-margin from both edges (offsets are divided by
   the zoom so the on-screen margin stays exact). Nested chrome is never zoomed twice. */
.nabla-corner { position:fixed;z-index:48;zoom:var(--nabla-ui-scale,1);pointer-events:auto; }
.nabla-corner--tl { top:calc(var(--nabla-ui-margin) / var(--nabla-ui-scale));left:calc(var(--nabla-ui-margin) / var(--nabla-ui-scale)); }
.nabla-corner--tr { top:calc(var(--nabla-ui-margin) / var(--nabla-ui-scale));right:calc(var(--nabla-ui-margin) / var(--nabla-ui-scale)); }
.nabla-corner--bl { bottom:calc(var(--nabla-ui-margin) / var(--nabla-ui-scale));left:calc(var(--nabla-ui-margin) / var(--nabla-ui-scale)); }
.nabla-corner--br { bottom:calc(var(--nabla-ui-margin) / var(--nabla-ui-scale));right:calc(var(--nabla-ui-margin) / var(--nabla-ui-scale)); }
.nabla-corner :is(.nabla-corner,.settings-toggle,.touch-flight-bar) { zoom:1; }
:is(.settings-toggle,.touch-flight-bar,#speed-display,#gear-display):not(.nabla-corner *) { zoom:var(--nabla-ui-scale,1); }
/* Button groups: one row (or column) of equal buttons with one gap. */
.nabla-btn-group { display:flex;flex-direction:row;flex-wrap:wrap;align-items:center;justify-content:flex-end;gap:var(--nabla-btn-gap); }
.nabla-btn-group--column { flex-direction:column;align-items:flex-end; }
.nabla-btn-group[hidden],.nabla-btn[hidden] { display:none!important; }
.nabla-btn { ${interfaceControls} flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;height:var(--nabla-btn-size);min-height:var(--nabla-btn-size);min-width:var(--nabla-btn-size);padding:0 8px;font:700 14px/1 Arial,sans-serif;cursor:pointer;touch-action:none; }
.nabla-btn--wide { min-width:78px; }
.nabla-btn:has(> svg:only-child) { padding:0;width:var(--nabla-btn-size); }
.nabla-btn svg { display:block;flex:none; }
.nabla-btn kbd { font:inherit;color:inherit; }
.nabla-btn:hover:not(:disabled),.nabla-btn:active:not(:disabled) { background:${interfaceTheme.pressed}; }
.nabla-btn:focus-visible { outline:2px solid var(--muted);outline-offset:2px; }
.nabla-btn[aria-pressed="true"] { color:var(--accent);border-color:var(--accent); }
.nabla-btn-popover { position:relative; }
.nabla-slider-panel { position:absolute;right:calc(var(--nabla-btn-size) + 10px);bottom:0;width:76px;padding:8px;background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius);font:14px Arial,sans-serif;box-shadow:none; }
/* Engine-only layout: the toolbar column under the menu button, weapon buttons below it. */
.game-toolbar.nabla-corner--tr { top:calc((var(--nabla-ui-margin) + var(--nabla-ui-row) + 8px) / var(--nabla-ui-scale));max-height:calc(100% - 70px); }
.weapon-controls:not(.nabla-corner *) { position:absolute;right:8px;top:220px;z-index:48;max-width:260px; }
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
