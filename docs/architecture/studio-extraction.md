# Studio boundary

Studio is maintained in [nabla-studio](https://github.com/txemavs/nabla-studio).
It consumes a packaged Engine; it has no source aliases into this repository.

Play mounts `@nabla/engine/runtime/browser` in a temporary viewport and pauses
the editor renderer. Engine owns input, simulation, camera recovery, wheel
diagnostics, HUD, sky, fog, monitors, portals and the frame clock. Stopping Play
disposes those resources and restores the untouched editor scene. Studio owns
project persistence, preparation services, selection, transforms and editor panels.

`SceneEditor` remains a DOM-free scene transaction/history service in Engine.
`PerformanceMonitor` remains reusable render diagnostics. Neither depends on
Studio, Vue, Pinia or Desktop. UI editing tools belong to Studio.

Historical migration notes and editor UI documents live in Studio's `docs/`.
