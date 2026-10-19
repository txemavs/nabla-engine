# Visibility distances in the menu

Where the draw, fog, road, building, collision and far-relief distances live, what existed
before, and how they behave. Menu path: **Configuración → Vídeo → Distancias**.

## What existed before (audit, October 2026)

| Setting                                                       | Engine field                        | Where the player could change it                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terrain draw/load distance (1–20 km)                          | `quality.distance`, `setStreaming`  | Desarrollo → **Caché** → «Radio de carga», mixed in with the disk cache. Only in games that have the Terreno source section.                                                                                                                                                      |
| Ground detail distance (1–3 cells ≈ 1–3 km)                   | `setGroundDetailCells`              | Buried in Mundo → Opciones → «Contraste del asfalto».                                                                                                                                                                                                                             |
| Fog (500 m – 16 km), roads, buildings, collisions, far relief | `quality.fog`, `roads`, … (profile) | **The Studio application only** («ALCANCE»: Dibujado, Niebla, Relieve, Carreteras, Edificios, Colisiones). Removed with Studio in `e9148aac` (4 October); the game never had these controls and only offered the quality profile (Predeterminada … Ultra, applied with a reload). |

So fog and the other distances were not lost from the game menu by a refactor: they only ever
existed in Studio, and the game's quality profile chose them. The terrain and ground-detail
distances existed in the game but were hard to find.

## What there is now

One section, **Distancias**, in Configuración → Vídeo (right after Calidad):

- Distancia de dibujo del terreno (the former «Radio de carga», moved, same control and storage).
- Niebla, Carreteras (including «Ocultas»), Edificios, Colisiones, Relieve lejano: new live controls.
- Distancia de detalle del suelo (moved from «Contraste del asfalto»).

Values come from `visibilityChoices` in `src/config/performance.ts`, the same lists the quality
profiles are validated against, written in km from 1000 m. They are applied live by
`GameRuntime.setVisibility()` (fog, roads and buildings are read every frame; relief goes to the
horizon, collisions to the running simulation). `GameRuntime.visibility` reads them back.

**Defaults are unchanged.** Nothing is applied until the player picks a value. A choice is
remembered under `nabla.visibility` (`nabla.visibility/1`) **for the quality profile it was made
in**: switching profile starts from that profile's own values. The key is part of the settings
export/import catalog. No colour, lighting, sky or material code is involved: only the distances
the profile already used.

## Not in the engine (options, not built)

- Separate **shadow distance**: shadow range follows the shadow tier (`shadows.ts` cascades).
- Separate **cloud / sky draw distance** and **vegetation / tree draw distance**: no field exists;
  clouds and trees follow `distance` and the fog.
- **Vehicle / props draw distance** and **LOD bias**: no field exists.
- A **field-light radius** is the «Farolas cercanas con luz» count (lamps), not a distance.

## Files

`game/distances-ui.ts` (section), `src/runtime/visibility-settings.ts` (storage),
`src/config/performance.ts` (`visibilityChoices`, `VisibilitySettings`), `src/runtime/browser.ts`
(`setVisibility`, `visibility`), `game/settings-hud.ts` (placement).
