import { interfaceVariables, interfaceControls } from '../src/runtime/interface-theme.js'

/** Full-screen HTML monitor, using the same theme tokens and controls as world-space monitors. */
export const settingsNavigationStyles = `
.settings-window { ${interfaceVariables} position:fixed;inset:0;z-index:100;width:100vw;height:100dvh;pointer-events:auto;background:var(--surface);color:var(--ink);font:var(--text-size)/1.4 Arial,sans-serif; }
.settings-window[hidden],.settings-window [hidden]{display:none!important}
.settings-window .settings-console {display:grid;grid-template-rows:64px 60px minmax(0,1fr) 58px;width:100%;height:100%;min-height:0;padding:0;margin:0;overflow:hidden;transform-style:flat;background:var(--surface);border:0;border-radius:0;font:inherit;color:inherit;}
.settings-header {display:flex;align-items:center;padding:0 30px;border-bottom:1px solid #333;}
.settings-header strong{font:16px Arial,sans-serif!important;letter-spacing:2px;min-height:0!important;margin:0!important;color:var(--muted)}
.settings-tabs{display:flex;align-items:stretch;gap:6px;padding:0 30px;border-bottom:1px solid var(--line);overflow-x:auto}
.settings-console .settings-tab{margin:0;padding:0 22px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--muted);font-size:20px;white-space:nowrap}
.settings-console .settings-tab[aria-selected=true]{border-bottom-color:var(--accent);background:var(--button);color:var(--ink)}
.settings-panes,.settings-pane{min-height:0;height:100%;overflow:hidden}
.settings-pane{display:grid;grid-template-columns:282px minmax(0,1fr)}
.settings-sections{overflow:auto;border-right:1px solid var(--line);background:#1b1b1b;padding:26px 18px;}
.settings-section-content{overflow:auto;padding:34px 46px;min-width:0;}
.settings-sections button{display:block;width:100%;text-align:left;margin:0 0 6px;padding:10px 14px;min-height:46px;background:transparent;border:1px solid transparent;border-left:2px solid transparent;border-radius:2px;color:var(--muted);font-size:17px}
.settings-sections button[aria-current=page]{background:var(--button);color:var(--ink);border-color:#3b3b3b;border-left-color:var(--accent)}
.settings-nav-group summary{padding:10px 14px;cursor:pointer;font-size:17px}.settings-nav-group button{margin-left:12px;width:calc(100% - 12px);font-size:15px}
.settings-section-content>.menu-section{display:block;max-width:1000px;margin:0 auto;padding:0;border:0;min-width:0}
.settings-section-content>.menu-section::before{content:attr(data-section-title);display:block;font-size:28px;margin:0 0 28px}
.settings-window label{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin:0;padding:16px 0;min-height:66px;border-bottom:1px solid #363636;font-size:18px;}
.settings-window :is(button,select,input:not([type=range],[type=checkbox])){${interfaceControls}}
.settings-window input[type=checkbox]{accent-color:var(--accent);width:21px;height:21px}
.settings-window input[type=range]{accent-color:var(--accent);flex:1;min-width:100px;max-width:380px}
.settings-window input[type=number]{max-width:100px}.settings-window select{max-width:420px;margin:0}.settings-window label select{margin-left:auto}
.settings-window button{font-size:17px;margin:8px 6px 8px 0}.settings-window button:hover{background:#303030}.settings-window :focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.settings-window p,.settings-window small{font-size:15px;color:var(--muted);margin:12px 0}.settings-window .menu-subtitle{font-size:17px;color:var(--ink)}
.settings-window .menu-section .menu-section{margin:28px 0 0;padding:20px 0 0;border:0;border-top:1px solid var(--line)}
.settings-window .menu-section .menu-section>legend{font-size:21px;padding:0 12px 0 0}
.settings-window output{font:15px monospace;color:var(--ink)}.settings-window pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--button);padding:16px;font-size:13px}.settings-window textarea{font-size:14px}
.settings-footer{display:flex;align-items:center;justify-content:space-between;padding:0 30px;border-top:1px solid var(--line)}.settings-footer small{margin:0;font-size:13px;line-height:1.3}.settings-footer button{font-size:13px;min-height:30px;margin:0;padding:4px 10px;color:var(--muted)}
.settings-toggle{${interfaceVariables}${interfaceControls}position:fixed;top:12px;right:20px;z-index:110;min-width:64px;width:auto;height:40px;padding:4px 10px;cursor:pointer;}
.settings-toggle[aria-expanded=true]{font-size:0!important;width:46px!important;min-width:46px!important}.settings-toggle[aria-expanded=true]::after{content:'↓';font:28px Arial,sans-serif;color:var(--ink)}
.settings-is-open .game-toolbar{display:none!important}
.settings-key-tools{display:flex;gap:14px;margin-bottom:24px;flex-wrap:wrap}.settings-key-tools input{flex:1;min-width:160px}.settings-key-table{width:100%;border-collapse:collapse;font-size:16px}.settings-key-table :is(th,td){border-bottom:1px solid #363636;padding:12px 0;text-align:left}.settings-key-table th{color:var(--muted);font-size:13px;font-weight:400}.settings-key-table td:last-child{text-align:right}.settings-key-table small{display:block;font:11px monospace;margin:4px 0 0}.settings-key-table kbd{display:inline-block;border:1px solid var(--line);padding:3px 8px;background:var(--button);border-radius:2px;font:14px monospace}
.settings-tile-map{position:relative;width:100%;height:55vh;min-height:250px;background:#151515;border:1px solid var(--line);overflow:hidden}.settings-map-tile{position:absolute;display:grid;place-items:center;border:1px solid #444;background:#242424;font:11px monospace;overflow:hidden;white-space:nowrap}.settings-map-tile.state-visible{background:#31543e}.settings-map-tile.state-resident{background:#304336}.settings-map-tile.state-downloading{background:#243e54}.settings-map-tile.state-installing{background:#493e56}.settings-map-tile.state-retry{background:#592e2e}

/* Navigation stays flat even under the generic monitor button selectors. */
.settings-window .settings-sections button{background:transparent;border:1px solid transparent;border-left:2px solid transparent;font-size:17px;padding:10px 14px;margin:0 0 6px;min-height:46px;color:var(--muted)}
.settings-window .settings-sections button[aria-current=page]{background:var(--button);border-color:#3b3b3b;border-left-color:var(--accent);color:var(--ink)}
.settings-window .settings-nav-group button{font-size:15px}
.settings-window .settings-tab{background:transparent;border:0;border-bottom:2px solid transparent;border-radius:0;margin:0;padding:0 22px;color:var(--muted)}
.settings-window .settings-tab[aria-selected=true]{background:var(--button);border-bottom-color:var(--accent);color:var(--ink)}
@media(max-width:850px){.settings-pane{grid-template-columns:205px minmax(0,1fr)}.settings-section-content{padding:25px}.settings-tabs{padding:0 8px}.settings-console .settings-tab{padding:0 14px;font-size:17px}}
@media(max-width:520px){.settings-pane{grid-template-columns:145px minmax(0,1fr)}.settings-sections{padding:18px 6px}.settings-window .settings-sections button{padding:9px 7px;font-size:14px}.settings-section-content{padding:20px 14px}.settings-section-content>.menu-section::before{font-size:23px}.settings-nav-group summary{padding:9px 7px;font-size:14px}.settings-nav-group button{margin-left:5px;width:calc(100% - 5px);font-size:13px}.settings-key-table{font-size:13px}.settings-key-table kbd{font-size:11px;white-space:normal}.settings-window input,.settings-window select{max-width:100%;min-width:0}.settings-window label{font-size:16px}.settings-header,.settings-footer{padding:0 16px}.settings-header strong{font-size:13px!important}.settings-window .settings-console{grid-template-rows:64px 52px minmax(0,1fr) 65px}}
`
