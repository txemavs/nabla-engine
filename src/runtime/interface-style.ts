import { interfaceControls, interfaceTheme, interfaceVariables } from './interface-theme.js'

/**
 * Default HTML chrome of the engine: the quiet monochrome look first shipped by Euskadi Online
 * (36 px controls, 2 px radius, dark buttons, thin grey lines). Hosts add only branding and texts
 * on top. Layout positions stay with each component; this sheet only skins them.
 */
export const defaultInterfaceStyles = `
:root { ${interfaceVariables} --nabla-control-edge:20px; --nabla-control-bottom:60px; }
/* ===== Buttons: the only button styles of the engine and its hosts. =====
   Every size derives from these variables; hosts change variables (theme, scale), never rules.
   Corners place groups, groups place buttons; no scaling tricks, no overrides, no inline styles. */
:root {
  --nabla-ui-scale:0.66; --nabla-ui-margin:12px; --nabla-btn-gap:6px;
  --nabla-btn-size:calc(36px * var(--nabla-ui-scale));
  --nabla-btn-font:calc(14px * var(--nabla-ui-scale));
  --nabla-btn-font-lg:calc(20px * var(--nabla-ui-scale));
  --nabla-btn-pad:calc(8px * var(--nabla-ui-scale));
  --nabla-btn-icon:calc(22px * var(--nabla-ui-scale));
  --nabla-btn-wide:calc(78px * var(--nabla-ui-scale));
  --nabla-btn-active:var(--accent);
  /* One button row on screen, for text aligned to the button grid (titles, hints). */
  --nabla-ui-row:var(--nabla-btn-size); }
@media(pointer:coarse) { :root { --nabla-ui-scale:0.8; } }
@media(max-width:600px) { :root { --nabla-ui-margin:8px; } }
/* Corners: a group fixed --nabla-ui-margin from both edges. Use addCornerButton(). */
.nabla-corner { position:fixed;z-index:48;pointer-events:auto; }
.nabla-corner--tl { top:var(--nabla-ui-margin);left:var(--nabla-ui-margin); }
.nabla-corner--tr { top:var(--nabla-ui-margin);right:var(--nabla-ui-margin); }
.nabla-corner--bl { bottom:var(--nabla-ui-margin);left:var(--nabla-ui-margin); }
.nabla-corner--br { bottom:var(--nabla-ui-margin);right:var(--nabla-ui-margin); }
/* Groups: one row (or column) of equal-height buttons with one gap; never wraps unless asked. */
.nabla-btn-group { display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:flex-end;gap:var(--nabla-btn-gap); }
.nabla-btn-group--column { flex-direction:column;align-items:flex-end; }
.nabla-btn-group--wrap { flex-wrap:wrap; }
.nabla-btn-group[hidden] { display:none; }
/* A button with a dropdown panel: same box as the button, the panel hangs below it. */
.nabla-btn-popover { position:relative;display:flex;flex:none; }
.nabla-btn { ${interfaceControls} flex:none;display:inline-flex;align-items:center;justify-content:center;gap:calc(var(--nabla-btn-pad) / 2);box-sizing:border-box;height:var(--nabla-btn-size);min-width:var(--nabla-btn-size);margin:0;padding:0 var(--nabla-btn-pad);font:700 var(--nabla-btn-font)/1 Arial,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap;cursor:pointer;touch-action:none; }
.nabla-btn[hidden] { display:none; }
.nabla-btn svg { display:block;flex:none;width:var(--nabla-btn-icon);height:var(--nabla-btn-icon); }
.nabla-btn kbd { font:inherit;color:inherit; }
.nabla-btn--icon,.nabla-btn:has(> svg:only-child) { width:var(--nabla-btn-size);padding:0; }
.nabla-btn--wide { min-width:var(--nabla-btn-wide); }
.nabla-btn--lg { font-size:var(--nabla-btn-font-lg); }
.nabla-btn:hover:not(:disabled),.nabla-btn:active:not(:disabled) { background:${interfaceTheme.pressed}; }
.nabla-btn:focus-visible { outline:2px solid var(--muted);outline-offset:2px; }
.nabla-btn--active,.nabla-btn[aria-pressed="true"] { color:var(--nabla-btn-active);border-color:var(--nabla-btn-active); }
.nabla-btn--disabled,.nabla-btn[aria-disabled="true"],.nabla-btn:disabled { opacity:.5;cursor:default; }
/* Dropdown panel of a popover (FOV, quality, clock): value box + vertical slider. */
.nabla-slider-panel { position:absolute;top:calc(100% + var(--nabla-btn-gap));right:0;z-index:1;display:flex;flex-direction:column;align-items:center;gap:var(--nabla-btn-gap);min-width:100%;box-sizing:border-box;color:var(--ink);text-align:center; }
.nabla-slider-panel[hidden] { display:none; }
.nabla-slider-panel label { display:flex;flex-direction:column;align-items:center;gap:var(--nabla-btn-gap);margin:0;padding:0; }
.nabla-slider-panel label > :is(span,output) { ${interfaceControls} display:flex;align-items:center;justify-content:center;box-sizing:border-box;height:var(--nabla-btn-size);min-width:100%;padding:0 var(--nabla-btn-pad);font:700 var(--nabla-btn-font-lg)/1 Arial,sans-serif; }
.nabla-slider-well { position:relative;width:40px;margin:0 auto; }
.nabla-slider-notch { position:absolute;left:-5px;width:50px;height:2px;background:#aaa;pointer-events:none; }
.nabla-vertical-range { appearance:none;writing-mode:vertical-lr;direction:rtl;width:40px;height:160px;margin:0;background:transparent;touch-action:none;cursor:pointer; }
.nabla-vertical-range::-webkit-slider-runnable-track { width:4px;background:#4448;border-radius:2px; }
.nabla-vertical-range::-webkit-slider-thumb { appearance:none;width:40px;height:40px;margin-left:-18px;background:var(--button);border:1px solid var(--line);border-radius:var(--radius); }
.nabla-vertical-range::-moz-range-track { width:4px;background:#4448; }
.nabla-vertical-range::-moz-range-thumb { width:38px;height:38px;background:var(--button);border:1px solid var(--line);border-radius:var(--radius); }
/* Engine pages without a host row: the toolbar is a column under the menu button. */
body > .game-toolbar { flex-direction:column;align-items:flex-end;top:calc(var(--nabla-ui-margin) + var(--nabla-ui-row) + var(--nabla-btn-gap)); }
body > .game-toolbar .nabla-slider-panel { top:0;right:calc(100% + var(--nabla-btn-gap)); }
.weapon-controls:not(.nabla-corner *) { position:absolute;right:8px;top:220px;z-index:48;max-width:260px; }
/* ===== End of buttons. ===== */
/* Gauges keep their own fixed layout and follow the UI scale as a whole. */
:is(.touch-flight-bar,#speed-display,#gear-display) { zoom:var(--nabla-ui-scale); }
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
