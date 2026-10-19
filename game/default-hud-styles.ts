import {
  interfaceControls,
  interfaceTheme,
  interfaceVariables,
} from '../src/runtime/interface-theme.js'

/** Default HUD layout and chrome (see default-hud.ts). */
export const DEFAULT_HUD_CSS = `
:root { ${interfaceVariables} }
#nabla-hud-footer { position:fixed;top:24px;right:20px;max-width:calc(100vw - var(--nabla-hud-title-width,160px) - 60px);min-height:12px;z-index:40;display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-end;gap:4px;padding:0;box-sizing:border-box;background:transparent;color:#eee;font:16px/20px Arial,sans-serif;text-align:right;text-shadow:0 1px 4px #000;pointer-events:none; }
#nabla-hud-footer[hidden] { display:none!important; }
html.nabla-intro #nabla-hud-footer { display:none!important; }
#nabla-hud-brand { display:none; }
#nabla-hud-status { flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
#nabla-hud-status:empty { display:none; }
#nabla-hud-controls { position:fixed;left:20px;top:52px;max-width:calc(100vw - 40px);text-align:left;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0; }
#nabla-hud-controls[hidden],body.settings-is-open #nabla-hud-controls { display:none!important; }
#nabla-hud-controls kbd { font:700 16px/20px Arial,sans-serif; }
#nabla-hud-fps { position:fixed;left:20px;bottom:12px;z-index:1100;color:#eee;text-shadow:0 1px 4px #000;pointer-events:none;font:10px/12px Arial,sans-serif;font-variant-numeric:tabular-nums;opacity:.8; }
#nabla-hud-fps[hidden] { display:none; }
#nabla-hud-load-step { position:fixed;left:20px;bottom:12px;z-index:1100;max-width:calc(100vw - 40px);font:10px/12px Arial,sans-serif;color:#eee;text-align:left;text-shadow:0 1px 4px #000;pointer-events:none; }
#nabla-hud-load-step[hidden] {display:none;}
@media(max-width:600px),(hover:none) and (pointer:coarse){#nabla-hud-fps,#nabla-hud-load-step{display:none!important;}}
#nabla-hud-controls kbd.is-held { color:#000;background:#eee; }
#game-hud,.nabla-game-hud { display:none!important; }
/* Hide unadopted Engine controls until the host puts them in their final slot. */
body > .game-toolbar, #settings-toggle:not(.nabla-hud-menu-clock) { visibility:hidden!important; }
#nabla-hud-actions { position:fixed;right:20px;top:12px;bottom:auto;z-index:48;display:flex;flex-direction:column;align-items:flex-end;gap:6px;max-width:calc(100vw - 32px);pointer-events:none; }
#nabla-hud-actions .game-toolbar { position:static!important;width:auto!important;max-height:none!important;min-width:0;flex-direction:row!important;flex-wrap:wrap;justify-content:flex-end;gap:6px!important;pointer-events:auto; }
#nabla-hud-actions .game-toolbar > :is(.game-toolbar-navigation,.weapon-controls) { flex-direction:row!important;flex-wrap:wrap;justify-content:flex-end;gap:6px!important; }
#nabla-hud-fixed,#nabla-hud-context { display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap; }
#nabla-hud-context { position:fixed;right:20px;bottom:12px;max-width:calc(100vw - 32px);order:2; }
#nabla-hud-actions[hidden],#nabla-hud-context:empty,#nabla-hud-actions [hidden] { display:none!important; }
#nabla-hud-actions #nabla-hud-footer { position:static;order:1;max-width:min(90vw,800px); }
#nabla-hud-context button { height:36px!important;min-width:36px;padding:0 8px!important;border:1px solid var(--line)!important;border-radius:var(--radius)!important;background:var(--button)!important;color:var(--ink)!important; }
#nabla-hud-context button[data-context-icon] { display:flex!important;align-items:center;justify-content:center;gap:6px;width:auto!important;min-width:62px;flex:none; }
#nabla-hud-context button[data-control-action="lights"][aria-pressed="true"] svg { color:#48e078; }
#nabla-hud-context button[data-control-action="highBeam"][aria-pressed="true"] svg { color:#429bff; }
#nabla-hud-context button[data-context-icon] kbd { font:700 20px/1 Arial,sans-serif;color:inherit; }
#nabla-hud-context button[data-context-icon] span { font:700 12px/1 Arial,sans-serif; }
#nabla-hud-context :is(.game-toolbar-navigation,.weapon-controls) { position:static!important; }
#nabla-hud-context .game-toolbar-navigation,#nabla-hud-context .weapon-controls { display:flex;flex-direction:row!important;gap:6px!important; }
#nabla-hud-actions button { ${interfaceControls} font-weight:700;cursor:pointer;touch-action:manipulation;pointer-events:auto; }
#nabla-hud-actions .game-toolbar button { width:78px!important;height:36px!important;min-width:78px!important;font:700 14px/1 Arial,sans-serif!important;min-height:36px!important;padding:0!important;border:1px solid var(--line)!important;border-radius:var(--radius)!important;background:var(--button)!important;color:var(--ink)!important;box-shadow:none!important; }
#nabla-hud-actions .game-toolbar button[data-compact="true"] { width:36px!important;min-width:36px!important; }
#nabla-hud-headlamp[hidden] { display:none!important; }
#nabla-hud-headlamp[aria-pressed="true"] { color:var(--accent,#2196f3)!important;border-color:var(--accent,#2196f3)!important; }
#nabla-hud-options-toggle { position:fixed;left:20px;top:12px;z-index:120;background:var(--button);color:var(--ink);border:1px solid var(--line);border-radius:2px;cursor:pointer;display:grid;place-items:center;box-sizing:border-box;width:36px;min-width:36px;height:36px;padding:0;flex:none;line-height:1; }
@media(max-width:600px) { #nabla-hud-options-toggle { left:8px;top:8px; } }
#nabla-hud-options-toggle svg { display:block; }
#nabla-hud-options-toggle[data-menu-open="true"] { background:#238447!important;color:#fff!important;border-color:#238447; }
body:has(#nabla-hud-options-toggle) .settings-close { display:none; }
body:has(#nabla-hud-options-toggle) .settings-header { padding-left:72px; }
body:has(#nabla-hud-options-toggle[data-menu-open="true"]) #nabla-hud-options-toggle { top:14px; }
#nabla-hud-options-toggle[data-pointer-locked="true"] { font:700 12px/1 Arial,sans-serif;letter-spacing:0;color:#ff3344; }
#nabla-hud-actions button:hover:not(:disabled),#nabla-hud-actions button:active:not(:disabled) { background:${interfaceTheme.pressed}!important; }
#nabla-hud-actions button:focus-visible { outline:2px solid var(--muted);outline-offset:2px; }
#nabla-hud-actions .game-toolbar > div > div { top:calc(100% + 6px)!important;bottom:auto!important;right:0!important;background:var(--surface)!important;color:var(--ink)!important;border:1px solid var(--line)!important;border-radius:var(--radius)!important;font:14px Arial,sans-serif!important; }
#nabla-hud-actions .game-toolbar > div > div button { width:auto!important;padding:4px 8px!important; }
#settings-toggle.nabla-hud-menu-clock { position:static!important;pointer-events:auto;flex:none;width:auto;min-width:64px;height:36px;padding:0 10px;font:700 20px/1 Arial,sans-serif;letter-spacing:0;font-variant-numeric:tabular-nums;background:var(--button);color:var(--ink);border:1px solid var(--line);border-radius:var(--radius); }
#settings-toggle.nabla-hud-menu-clock[aria-expanded=true] { font-size:20px!important;width:auto!important;min-width:64px!important; }
#settings-toggle.nabla-hud-menu-clock::after { content:none!important; }
#nabla-hud-clock-group { position:relative;display:flex;align-items:center;flex:none;pointer-events:auto; }
.nabla-hud-time-controls { position:absolute;top:calc(100% + 8px);right:0;width:100%;box-sizing:border-box;display:flex;align-items:center;flex-direction:column;gap:8px;padding:0;background:transparent;border:0;color:var(--ink);font:12px Arial;text-shadow:0 1px 4px #000; }
.nabla-hud-clock-real { box-sizing:border-box;width:100%;min-width:0;height:36px; }
.nabla-hud-time-controls[hidden],.nabla-hud-time-bar[hidden] { display:none; }
.nabla-hud-time-bar { display:flex;flex-direction:column;align-items:center;gap:4px; }
/* Match all three dropdowns: 36px value row, 8px gap, 160px transparent slider. */
#nabla-hud-actions .game-toolbar .nabla-slider-panel { top:calc(100% + 8px)!important;right:0!important;bottom:auto!important;width:100%!important;min-width:0!important;padding:0!important;background:transparent!important;border:0!important;box-shadow:none!important; }
#nabla-hud-actions .nabla-slider-panel label { margin:0;padding:0;gap:8px; }
#nabla-hud-actions .nabla-slider-well { margin:0 auto; }
#nabla-hud-actions .nabla-slider-panel label > :is(span,output),.nabla-hud-clock-real { display:flex;align-items:center;justify-content:center;box-sizing:border-box;height:36px;width:100%;font:700 20px/1 Arial,sans-serif!important;background:var(--button);border:1px solid var(--line);border-radius:var(--radius);color:var(--ink); }
#nabla-hud-actions .nabla-vertical-range { margin:0;height:160px; }
.settings-is-open :is(#nabla-hud-actions,#nabla-hud-place,#nabla-hud-footer,#nabla-hud-load-step) { display:none!important; }
body:has(#loading-screen:not(.hidden)) :is(#nabla-hud-actions,#nabla-hud-place,.touch-driving-place) { visibility:hidden!important; }
body:has(#nabla-credits:not(.in-game):not(:empty)) #nabla-hud-actions { visibility:hidden;pointer-events:none; }

#nabla-hud-place,.touch-driving > .touch-driving-chrome > .touch-driving-place { position:fixed!important;left:66px!important;right:auto!important;top:12px!important;bottom:auto!important;z-index:40;margin:0!important;padding:0!important;width:max-content!important;max-width:calc(100vw - 86px)!important;min-width:0;pointer-events:none;text-align:left!important;color:var(--ink);text-shadow:0 1px 4px #000; }
.nabla-hud-city,.touch-driving-place .touch-driving-city { font:700 20px/36px Arial,sans-serif!important;height:36px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis; }
.nabla-hud-city::after,.touch-driving-city::after { content:attr(data-game-date);margin-left:14px;font-size:14px;font-weight:400; }
.nabla-hud-clock-row,.nabla-hud-street,.touch-driving-place .touch-driving-street { display:none!important; }
.touch-driving-city.nabla-hud-nodata { visibility:hidden; }
.touch-driving .touch-driving-wheel { position:fixed;right:20px;bottom:60px; }
@media(max-width:600px) {
 #nabla-hud-footer {right:8px;top:20px;max-width:calc(100vw - var(--nabla-hud-title-width,160px) - 32px);}
 .nabla-hud-message-wrap #nabla-hud-footer {left:8px;right:8px;top:52px;max-width:none;}
 .nabla-hud-message-wrap #nabla-hud-footer :is(#nabla-hud-status,#nabla-hud-controls){white-space:normal;overflow-wrap:anywhere;}
 .touch-driving .touch-driving-wheel {right:8px;bottom:52px;}
}
@media(max-width:600px) { #nabla-hud-controls {left:8px;top:48px;max-width:calc(100vw - 16px);} #nabla-hud-actions {right:8px;top:8px;bottom:auto;gap:4px;} #nabla-hud-actions .game-toolbar,#nabla-hud-actions .game-toolbar > :is(.game-toolbar-navigation,.weapon-controls){gap:4px!important;} #nabla-hud-place,.touch-driving > .touch-driving-chrome > .touch-driving-place{left:50px!important;top:8px!important;max-width:calc(100vw - 58px)!important;} }
`

export function installDefaultHudStyles(doc: Document = document): void {
  if (doc.getElementById('nabla-hud-style')) return
  const style = doc.createElement('style')
  style.id = 'nabla-hud-style'
  style.textContent = DEFAULT_HUD_CSS
  doc.head.append(style)
}
