# Appendix E. Troubleshooting

[Manual contents](README.md)

| Symptom                                         | First checks                                             | Interpretation or next step                                                    |
| ----------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Port 5174 is busy                               | Existing development process and its HTTPS configuration | Vite uses strict port selection; preserve the intended test origin             |
| Offline browser scene throws about coordinates  | `scene.geography`                                        | Browser runtime requires geography even without `tiles`                        |
| Car exists but does not drive                   | Definition, ignition, parked state, input, stepping      | Model visibility does not establish a valid running vehicle                    |
| Scene import fails                              | Schema version, IDs, spawn, quaternion, parent graph     | Use `parseScene`; JSON syntax alone is insufficient                            |
| Atlas request returns 403                       | Exact object path, `z/` prefix, publication filename     | On this Atlas deployment, missing objects return 403                           |
| Loader requests `manifest.json`                 | Default static-loader path                               | Known mismatch with the described hash-only Atlas publication                  |
| Tile returns HTML                               | Proxy and SPA fallback configuration                     | Preserve resource status/content type; do not parse an app shell as a manifest |
| Browser reports terrain CORS failure            | Request origin and `/tiles` proxy                        | Atlas supports direct CORS access; inspect the actual response                 |
| Terrain is visible but collision fails          | Collision installation, frame, layer/version             | Rendering readiness is not collision readiness                                 |
| Roads appear duplicated                         | Cell version and unified ground behavior                 | Do not overlay legacy asphalt on ground that already contains it               |
| Loading tile count stops changing               | Current preparation phase and reveal gates               | GPU/asset work may continue without additional tile progress                   |
| WebGPU requested but WebGL used                 | Actual backend and `fallbackReason`                      | Fallback is implemented behavior                                               |
| Audio is silent                                 | User gesture, enabled state, master/music levels, URL    | Diagnose context and source separately                                         |
| Headset cannot connect                          | Hostname, trusted HTTPS, supported session mode          | The headset's localhost is not the development computer                        |
| HTTPS page cannot join room                     | `wss://` endpoint and relay health                       | Insecure websocket URLs are incompatible with secure-page deployment           |
| Pickup is awarded twice                         | Direct local mutation plus authority subscription        | Apply contested outcomes through one authority event path                      |
| Re-entering a scene duplicates sounds/listeners | Cleanup ownership                                        | Dispose the prior runtime and host subscriptions                               |
| Package import works only in checkout           | Export map, built declarations, tarball                  | Source aliases may conceal a missing public export                             |

## A useful issue report

Include the package version and commit/working-tree context, exact entry URL,
browser/device, actual backend, source world, quality, cache state, and reproduction
steps. Attach the first relevant error with its URL/status and distinguish expected
from observed behavior. For a performance issue, add comparable timing samples;
for a physics issue, reduce the scene if possible.

Do not erase all saved settings or caches before recording the failing conditions.
If a clean-cache comparison is needed, keep it separate from the warm-cache run.
Do not change service permissions to work around an absent Atlas object.

## Deeper sources

- [Terrain contract and integration gap](10-terrain.md).
- [Lifecycle](06-lifecycle.md).
- [Diagnostics](24-performance.md).
- [Maintenance discrepancy register](maintenance.md).
