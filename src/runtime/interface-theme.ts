/** Shared visual language for HTML, CSS3D and canvas interfaces.
 * Control height is a minimum; world-space hit regions keep their authored size.
 */
export const interfaceTheme = {
  surface: '#1e1e1e',
  button: '#252525',
  accent: '#2196f3',
  background: '#121212',
  ink: '#eeeeee',
  muted: '#a6a6a6',
  line: '#444444',
  selected: '#203547',
  pressed: '#303030',
  radius: 2,
  textSize: 20,
  controlHeight: 36,
  press: 0,
} as const

const t = interfaceTheme
export const interfaceVariables = `
  --surface:${t.surface}; --button:${t.button}; --accent:${t.accent};
  --radius:${t.radius}px; --text-size:${t.textSize}px;
  --control-height:${t.controlHeight}px; --press:${t.press}px;
  --ink:${t.ink}; --muted:${t.muted}; --line:${t.line};
`
export const interfaceControls = `
  color:var(--ink); background:var(--button); border:1px solid var(--line);
  border-radius:var(--radius); font:400 var(--text-size)/1.2 Arial,sans-serif;
  min-height:var(--control-height); box-sizing:border-box; padding:5px 12px;
  box-shadow:none;
`
export const monitorThemeStyles = `
.portal-tablet-layer,.planet-settings-form,.portal-console,.helm-console,.helm-portal { ${interfaceVariables} }
.portal-console,.helm-console,.helm-portal,.planet-settings-form {
  background:var(--surface); color:var(--ink); font:400 var(--text-size)/1.3 Arial,sans-serif; border-radius:var(--radius);
}
.portal-tablet-layer button,.portal-tablet-layer select,.portal-tablet-layer input,
.planet-settings-form button,.planet-settings-form select,.planet-settings-form input { ${interfaceControls} }
.portal-tablet-layer button:hover:not(:disabled),.planet-settings-form button:hover:not(:disabled) { background:${t.pressed}; }
.portal-tablet-layer button:active:not(:disabled),.planet-settings-form button:active:not(:disabled) { background:${t.selected}; transform:none; box-shadow:none; }
.portal-tablet-layer button.is-on,.planet-settings-form button.is-on { background:${t.selected}; border-color:var(--accent); color:var(--ink); }
.portal-tablet-layer :focus-visible,.planet-settings-form :focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
.portal-console small,.helm-console small,.helm-indicators,.helm-console>strong,.helm-portal>strong { color:var(--muted); font-family:Arial,sans-serif; font-weight:400; letter-spacing:1px; }
.portal-tablet-layer .helm-mode { background:var(--button); border:1px solid var(--line); border-radius:var(--radius); color:var(--ink); }
.portal-tablet-layer .dpad { background:var(--button); border-color:var(--line); color:var(--ink); }
.portal-tablet-layer .systems-board button { font-size:var(--text-size); }
`
/** Inline CSS for the rasterised template: no network dependencies inside the SVG. */
export const xrMonitorThemeStyles = `
[data-monitor="xr-calibration"] { ${interfaceVariables} background:var(--surface); color:var(--ink); font:var(--text-size) Arial,sans-serif; }
[data-monitor="xr-calibration"] :is(.header,.development,.selector,.prev,.next,.minus,.plus,.footer,.option,.close) {
 background:var(--button); color:var(--ink); border:1px solid var(--line); border-radius:var(--radius); font-size:var(--text-size); font-weight:400;
}
[data-monitor="xr-calibration"] .row { background:var(--surface); border-bottom:1px solid var(--line); border-radius:0; }
[data-monitor="xr-calibration"] .dropdown { background:var(--surface); }
[data-monitor="xr-calibration"] :is(.hint,.status) { color:var(--muted); }
[data-monitor="xr-calibration"] .footer:empty { display:none; }
[data-monitor="xr-calibration"] .pressed { background:${t.selected}!important; border-color:var(--accent); transform:none; box-shadow:none; }
`
export const headsetPageStyles = `
.nabla-headset-page { ${interfaceVariables} background:${t.background}; color:var(--ink); font:var(--text-size)/1.4 Arial,sans-serif; }
.nabla-headset-page :is(button,select,input[type=text],input[type=url],input[type=number],.launch) { ${interfaceControls} }
.nabla-headset-page button,.nabla-headset-page .launch { cursor:pointer; }
.nabla-headset-page :is(button,.launch):hover:not(:disabled) { background:${t.pressed}; }
.nabla-headset-page :is(button,.launch):active:not(:disabled) { background:${t.selected}; transform:none; box-shadow:none; }
.nabla-headset-page :is(button,.launch):disabled { opacity:.4; cursor:default; }
.nabla-headset-page :focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
.nabla-headset-page :is(section,#panel,aside,#xr-main-menu,#xr-calibration) { background:var(--surface)!important; color:var(--ink)!important; border:1px solid var(--line)!important; border-radius:var(--radius)!important; box-shadow:none!important; }
.nabla-headset-page :is(h1,h2,h3) { color:var(--ink); font-weight:400; }
.nabla-headset-page :is(header p,article p,footer,.secondary) { color:var(--muted); }
.nabla-headset-page .actions { background:var(--surface); }
.nabla-headset-page .launch { background:${t.selected}; border-color:var(--accent); color:var(--ink); text-decoration:none; }
.nabla-headset-page :is(input[type=checkbox],input[type=range]) { accent-color:var(--accent); }
.nabla-headset-page #xr-main-menu { font:var(--text-size)/1.4 Arial,sans-serif!important; }
`
