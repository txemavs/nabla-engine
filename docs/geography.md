# Geography, horizon and sky

## Persistent location

`SceneDocument.geography` stores latitude, longitude, reference altitude and
`imagery` (`satellite`, `streets`, `offline`). The example starts at Madrid,
40.4166°, −3.70384°. The browser requests location on first opening; denial,
failure or timeout preserves the current point. **Mi ubicación** retries it.

Location changes are validated, undoable edits and require editing mode.
**Guardar** and JSON export preserve the selected origin. Moving or deleting the
authored ground entity does not move that origin.

## Geographic frame and precision

WGS84 latitude/longitude angles are mapped onto a mean-radius sphere of
6,371,000 m, not a survey ellipsoid or elevation model. The local origin is the
GPS point: +X east, +Y up and −Z north. Agency's patio wire format uses +Z north;
convert that axis explicitly when integrating.

`geoToLocal` and `localToGeo` use an Earth-centred frame, including antimeridian
crossings and large altitudes. Physics uses metres and double-precision numbers.
A smooth reference sphere supports players and vehicles beyond the authored lot;
gravity and flight follow its radial vertical. This is not orbital mechanics.

Shift/L3 scales assisted climb/descent with altitude, capped at 2,000 km/s, to make
planetary distances explorable. Releasing the controls brakes and holds altitude.
Loaded ascent/braking is tested, but discrete collision detection is not a general
guarantee of safety at extreme travel speeds.

## Rendering scales

Earth and celestial objects render in a separate pass whose unit is one million
metres. Tiles and scene objects use metres, with a render origin near the vehicle
at large distances. The renderer uses logarithmic depth. Both passes represent
the same location and do not create a second physics world.

The local map haze and planetary haze share color and converted distances. The
sky background uses the same color treatment, preventing a strip of unattenuated
Earth behind the map. Celestial objects retain planet occlusion without receiving
ground fog. At high altitude, the sky darkens and decorative stars appear.

## Authored ground and connected maps

Agency's original ground JPEG is a layer on the top face of a physical box,
declared by `entity.surface`. Its aspect ratio is 1024 × 682 and its width is
189.737 m, with the original road centre offset. The district geometry remains
above it. Source files are documented in [asset provenance](../assets/README.md).

The playground uses the same providers as Agency:

- Esri World Imagery for satellite imagery.
- CARTO Dark / © OpenStreetMap for streets.
- Local Earth and ground images for offline mode.

Connected requests disclose the selected geographic area to those providers,
including browser location if used. Source/attribution links are displayed in the
viewport. The host controls whether remote imagery is enabled. Offline mode does
not request external map images.

The loader limits requests to four concurrent downloads and two detail rings.
It aborts obsolete requests and disposes retired geometry/textures. Failed tiles
produce a partial-map status while retaining the low-resolution Earth fallback.
There is no bulk region download or remote map service inside `Simulation`.

Map roads and buildings are images: they do not automatically create physical
roads, sidewalks, buildings or terrain relief. The support sphere is smooth.
Physical detail must be authored explicitly.

## Sun, Moon and clock

The apparent directions adapt Agency's simplified `sunPosition.ts` formulas.
The Sun and Moon have approximate mean radii/distances; they are visual bodies,
not destinations with collisions or simulated orbits. The Moon's shading follows
the solar direction. These are not precision ephemerides.

`SceneDocument.sky` is optional:

```json
{ "mode": "live" }
```

or a frozen instant:

```json
{ "mode": "fixed", "at": "2026-09-21T12:00:00.000Z" }
```

Missing `sky` means live time. **Sol y Luna** provides a local date/time field,
**Aplicar hora** and **Tiempo real**. The displayed timezone is the browser's,
not one inferred from GPS. Fixed instants are stored as UTC and support saving,
JSON export and undo.

The shared clock updates apparent celestial directions each second and drives
scene shadows, ambient light, sky color, map brightness and star visibility.
Changing it during play preserves physics and does not reload the models.
