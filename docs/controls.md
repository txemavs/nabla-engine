# Controls and walkthrough

## Editing

Select an object in the viewport or scene tree. Use the transform gizmo or the
inspector to change position and rotation. Blocks also expose dimensions, color
and motion. Original GLB vehicles preserve their authored dimensions and materials.

| Action                | Control / UI label                               |
| --------------------- | ------------------------------------------------ |
| Orbit / zoom          | Drag the viewport / mouse wheel                  |
| Move / rotate tool    | G / R                                            |
| Frame selection       | F / Enfocar                                      |
| Create objects        | ESCENA + → Bloque, Coche, Sprite, Grupo          |
| Duplicate / delete    | Duplicar / Eliminar                              |
| Undo / redo           | Toolbar buttons; Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z |
| Save locally          | Guardar / Ctrl/Cmd+S                             |
| Export / import scene | Exportar / Abrir JSON                            |
| Load current example  | Escena A3                                        |
| Play / stop           | Jugar / Detener / F8                             |

Reparenting preserves the world transform. Groups can be expanded in the scene
tree. Saving stores the authored document, not the runtime physics state.

## Hovering and driving

| Action                                            | Keyboard                          |
| ------------------------------------------------- | --------------------------------- |
| Hover / drive                                     | WASD or arrows                    |
| Look around                                       | Move the mouse (no click or hold) |
| Release pointer                                   | Esc                               |
| Accelerate                                        | Shift                             |
| Handbrake in vehicle                              | Space                             |
| Enter / exit                                      | E                                 |
| Camera cycle (incl. overhead / cinematic)         | C                                 |
| Overhead height / cinematic distance              | Mouse wheel                       |
| Latch / release cargo                             | F                                 |
| Transfer controls between latched car and carrier | T                                 |
| Restart play                                      | R                                 |
| Lights: posición → cruce → apagadas               | H                                 |
| High / low beams (with cruce)                     | K                                 |
| Indicators left / right                           | Z / X                             |

Entering requires proximity and a nearly stopped vehicle. Exiting requires low
speed and a free exit volume. Cars require supporting ground; a carrier with an
interior places the monitor beside its helm, including while hovering at altitude. Blocked exits
leave the player inside and display a status message.

The standalone game keeps Studio's tactile driving HUD visible (`touchControls:
'always'`): the agency-ui drive rig — steering wheel, accelerator slider, red
handbrake and turbo — plus enter/exit and camera. Keyboard and gamepad still mix
through the same `GameInput` path. The cockpit circular twist ring around the
wheel (`controlDefaults.showPilotTouchRing`) stays disabled by default: its
visual is circular while the hit target is a square, so touches outside the
circle still registered. The ring DOM/CSS and `setPilot` path remain so it can
be re-enabled later. In cockpit view the helm touchscreen d-pads use that same
mapping in road mode (WASD and arrows steer and accelerate; Brake holds).
Coarse-pointer hosts that leave visibility on `auto` show the overlay only on
touch devices.
Which overlay and HUD readouts appear in each seat is decided by the vehicle's
[control profile](vehicle-controls.md).

### Vehicle lights

Getting into a car, the S3, the A3, the truck or any other vehicle with lights, the lights stay
off while the vehicle selects P and starts (starter, needle sweep). As soon as the engine runs
they switch to **position lights** (_posición_): the front lamps glow white and the rear lamps
red, with no beam on the road. On the truck, which has no separate front position bulb, the
low-beam lenses glow faintly instead. Hosts that skip the start-up (`ignition: false`) get
position lights at once on entry. If the engine is switched off again, the lights go off with it.

**H** then steps through the switch: _posición_ → _cruce_ (dipped beams, «Luces de cruce») →
_apagadas_ («Luces apagadas») → _posición_ («Luces de posición»). **K** swaps dipped for main
beams while _cruce_ is selected. A choice made with **H** during the start-up is kept. Brake,
reverse and indicator lamps work in every position. Hosts choose the position after the start-up
with `GameRuntimeOptions.startLights` (`'position'` by default, `'low'` for a night scene,
`'off'`); `SceneViewOptions.startLights` and `SceneView.startLights.mode` do the same on a bare
view.

## A3 and mobile garage

1. Load **Escena A3**, press **Jugar**, then **E** beside the A3.
2. Drive toward the carrier's rear ramp. Enter slowly and brake inside the garage.
3. When prompted, press **F**. The car latches to the floor and the ramp closes.
4. Press **T** to control the carrier. The attached car travels with it.
5. Stop, press **T** to return to the A3, then **F** to release it.
6. Reverse out with **S**. Use **C** to inspect the original interior.

The car must fit completely inside the bay with all four suspension rays supported
by that carrier. Control transfer is a prototype convenience, without a walking
animation. The ramp changes pose immediately rather than animating gradually.

## Settings menu (Ajustes)

The gear icon (top right) opens **Ajustes**, a tabbed window; **Esc** or «Cerrar» closes it.
A tab with nothing to show in the current game is hidden (Posición and Capas on the flat demo).

| Tab               | Contents                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Planeta**       | Hora (clock, speed, «Ahora») first; sky / sun / sea / cloud switches; cloud amount and pressure, sun flare; sea level and tide |
| **Posición**      | current `lat, lon`, «Copiar posición», «Ir a latitud, longitud»                                                                |
| **Calidad**       | quality profile, FPS limit and resolution scale; «Asfalto» (asphalt contrast)                                                  |
| **Capas**         | map layers: «Carretera», «Edificios y techos», «Foto del suelo»                                                                |
| **Vehículos**     | add a vehicle or object; «Volante» and «Espejos» (below)                                                                       |
| **Opciones**      | «Cámara cinematográfica al volcar», «R: reaparecer en la vía más cercana», «Nombres de poblaciones»                            |
| **Configuración** | «Valores del planeta» (config text + «Copiar config»); «Terreno» (source, cache, missing cells)                                |

Every control keeps its storage key, URL parameter and host default (`NABLA_BOOT`); only its
place in the window changed. The placement table is `SECTION_TABS` in `game/settings-hud.ts`.

## Steering wheel position

Sit in the driver view (**C**), open **Ajustes** (the gear icon, top right) and choose
**Vehículos**. The **Volante** group adjusts the wheel of the car you are in, live:

- «Volante: distancia»: + moves the wheel away from you toward the instrument cluster, along
  the steering column; − brings it closer.
- «Volante: altura»: + raises it, − lowers it.

Both range ±8 cm in 0.5 cm steps and show the value in cm. The choice is saved per model (the
S3 and the A3 keep their own) and comes back next time; «Restablecer volante» returns to the
default. The box under the sliders shows the values to make them the default for everyone
(«Valores para fijarlo», metres), and every change is logged in the browser console. The
group is disabled on foot and in vehicles without a separate steering mesh. Details:
[Vehicle anchors](vehicle-rigs.md#driver-steering-wheel-adjustment-runtime).

## Mirror angles

In the same **Vehículos** tab, the **Espejos** group turns the mirror glasses of the vehicle you
are in, live (cars and the truck):

- «Espejo izquierdo: giro» / «Espejo derecho: giro»: + turns the glass outward (you see more
  of the roadside), − inward (more of your own flank). ±15° in 0.5° steps.
- «Espejo izquierdo: inclinación» / «Espejo derecho: inclinación»: + up, − down. ±10°.

The mirror view follows at once (about twice the glass angle). The choice is saved per
vehicle (the S3, the A3 and the truck keep their own); «Restablecer espejos» returns to the
default. The box below shows «Valores para fijarlo» (degrees), and every change is logged in
the browser console. Sliders for a side the vehicle has no mirror on stay disabled. Details:
[Vehicle anchors](vehicle-rigs.md#driver-mirror-adjustment-runtime).

## Flight: mode 2

While piloting the 10×5 carrier, the on-screen car wheel/accelerator HUD is replaced by
Agency-style Mode 2 touch sticks (left climb/yaw, right pitch/roll), and the car
speedometer and gear readouts are hidden; the helm monitors show speed and altitude.
Cars and trucks keep the wheel, pedal overlay and speedometer. On foot and in trailers
only the Enter / exit and Camera buttons remain. Each vehicle picks this through its
[control profile](vehicle-controls.md) (`road`, `flight` or `none`).

At the carrier controls, **V** switches between ground and flight modes. The ramp
closes for flight. Centre the controls to level out, slow horizontal motion and
hold the selected altitude. Land and stabilize before switching back to ground
mode or releasing cargo.

| Flight action                        | Keyboard            | Standard gamepad            |
| ------------------------------------ | ------------------- | --------------------------- |
| Climb / descend                      | W / S               | Left stick vertical         |
| Yaw left / right                     | A / D               | Left stick horizontal       |
| Pitch forward / back                 | Up / down arrows    | Right stick vertical        |
| Roll left / right                    | Left / right arrows | Right stick horizontal      |
| Accelerated geographic climb/descent | Hold Shift with W/S | Hold L3 with altitude stick |
| Ground / flight                      | V                   | Y                           |
| Enter / exit                         | E                   | A                           |
| Camera                               | C                   | B                           |
| Latch / release                      | F                   | X                           |
| Transfer vehicle controls            | T                   | LB                          |
| Brake                                | Space               | RB                          |

On the ground, the gamepad's left stick steers; RT drives forward and LT reverses.
Press a gamepad button to make it discoverable to the browser. Losing focus or
connecting/disconnecting a controller leaves flight input neutral. Nonstandard
USB radios require an axis adapter; a calibration UI is not available yet.

## Location and maps

These imagery controls apply to the original circuit, located at Madrid,
40.4166°, −3.70384°. Its explicit test route requests browser location once.
The default Irun Ventas district uses anchored, bundled geography instead.

In **Ubicación en la Tierra**, edit latitude/longitude or select **Mi ubicación**.
Choose **Satélite**, **Calles** or **Sin conexión**, then **Aplicar GPS**. Use
**Guardar** to persist it. Location changes require editing mode and can be undone.
Connected maps disclose the requested geographic area to Esri or CARTO.

Zoom out in the editor or ascend in the carrier to move from the local scene to a
map and planetary view. The altitude display is relative to the reference sphere,
not to terrain relief in the photographs. Accelerated flight is a travel aid.

## Sun, Moon and time

In **Sol y Luna**, select a local date/time and press **Aplicar hora**, or select
**Tiempo real**. The indicated timezone is the browser's timezone, not one inferred
from GPS. Fixed instants are stored as UTC in the scene. A missing clock means live time.

The clock controls the apparent Sun and Moon, shadows, ambient light, sky color,
map brightness and stars. It can be changed during play without restarting physics.
Celestial positions are approximate; the Moon and Sun are visual bodies, not
physical destinations.

## Fixed Stargate prototype

Click **ESCENA + → Stargates** to add an undoable pair in front of the A3 and on the other
lane. Select either frame to change its destination or its shared connection mode:
**Cerrado** blocks and hides the destination, **Ventana** shows it but blocks
traversal, **Paso abierto** permits traversal from the front. Stop play to edit a
connection. Drive the A3 forward through the first frame or walk through it; the
same actor appears at the linked mouth. Do not approach from the opaque back face.

Frames can move and rotate around world Y. Tilt and mounting on a moving parent
are deliberately rejected in this prototype. Occupied or undersized exits block
transfer. See [portal status and design](portals.md) for the remaining work toward
the carrier and CSS-interior experience.

## Driving camera and avatar

The cockpit eye sits 0.26 m forward and 0.15 m below the authored driver anchor
in ordinary cars. The carrier eye sits 0.20 m back and 0.10 m below its pilot anchor. This is a host camera offset,
so existing saved A3 scenes receive the improvement without rewriting their data.
The cockpit position and orientation are rigidly attached to the interpolated
vehicle pose, including pitch and roll. Mouse look rotates the head relative to
the car; its offset stays fixed when the mouse stops. Entering cockpit view or
changing vehicles resets the head to face forward. Chase view follows heading
after a short manual-look grace period, increases response with speed, anticipates measured yaw rate,
and adds a bounded forward look. Field of view and chase distance stay fixed;
speed and turn telemetry are filtered to avoid projection/framing vibration.
In flight mode the chase view leans back about 7° (`flightChaseTilt`), easing in
and out, so the vehicle sits lower in frame and more of the route ahead shows.

### Mouse capture

One rule covers every mode (on foot, sidearm, chase, cockpit, flight): **while playing,
the game owns the mouse** with pointer lock. The first click on the viewport (or the
first key press after loading) captures it; it stays captured when drawing or holstering
the sidearm, boarding or leaving vehicles and changing camera views. Mouse look then
needs no held button; in a vehicle the overhead and cinematic views ignore mouse movement
and keep wheel zoom. On foot the mouse still turns the walking heading in every view.

**Esc** releases the mouse into free-cursor mode. It stays free (mouse movement does not
turn the camera) until the next **click** on the viewport, which only recaptures it: that
click does not fire. Pausing, stopping, opening the settings or display panels, or any
other UI taking focus from the canvas also frees the mouse; menus never request or fight
the lock themselves.

**In-world monitors** (ship helm, telemetry, place and systems screens, Stargate panels)
are the one exception. Clicking a monitor under the view centre while captured, or
clicking it after **Esc**, keeps the mouse free for that monitor's buttons. The next
click **outside** every monitor recaptures it. Touch, pen and browsers without pointer
lock look by dragging instead.

The on-foot avatar uses Agency's floating CRT monitor. It leans with movement and
acceleration, levels after braking and hovers gently. While driving, the monitor
sits at the same eye anchor as the cockpit camera, at a head-sized 0.238 m width,
without hovering or banking independently. It is visible from exterior and overhead
views and hidden in cockpit view to keep the view clear. Portal transfers reset
visual motion history rather than producing a large tilt.

Press **C** (gamepad **B**) to cycle **exterior → cockpit → overhead → cinematic**
(see [Camera modes](#camera-modes)). The overhead
view follows the vehicle heading: its nose stays at the top while the map rotates.
At rest it sits 45 m above the vehicle, showing about 30 m of road ahead. The car
stays at 75% of screen height. Camera height grows with speed and eases back after
braking or a collision. The mouse wheel adjusts the automatic distance (0.75–3×),
with a 45 m minimum and 600 m maximum height. Driving controls remain the same. Connected map tiles supply
road imagery, not extra road collisions or terrain elevation.

Rendering interpolates the physics snapshots: chassis, wheels, driver anchor and
player share the same render time. The cockpit eye is 0.15 m below and 0.26 m ahead of the authored car driver
anchor (the carrier keeps its separate helm offset). The Wrangler head is centred
at 1.58 m above the model ground, just ahead of the driver headrest. The monitor screen faces forward (−Z), restoring Agency's
original orientation.

### Camera modes

One cycle, one key: **C** (gamepad **B**). The engine owns it (`cycleGameCamera` in
`src/runtime/game-camera.ts`), so every host built on `GameRuntime` (standalone game, Studio)
gets the same modes.

| Seated (vehicle)   | On foot                |
| ------------------ | ---------------------- |
| Exterior (chase)   | First person           |
| Driver (cockpit)   | Third person           |
| Overhead (cenital) | Overhead (cenital)     |
| Cinematic (drone)  | Cinematic (drone)      |
| → back to exterior | → back to first person |

- **Overhead (cenital)** looks straight down at the vehicle or player and follows it
  (critically damped, with velocity feed-forward, so there is no lag at steady speed). It is
  **heading-up**: the vehicle's nose, or on foot the walking heading,
  points to the top of the screen, so W always moves up the screen and the map turns
  around you (north-up would make steering mirror-reversed when driving south). In a
  vehicle it keeps the existing framing (car at 75% of screen height, 45–600 m, height
  grows with speed). On foot the player stays centred at `footMapHeight` (18 m) × wheel zoom
  0.75–3× (about 13–54 m); move the mouse to turn.
- **Crashes and rollovers.** The overhead and exterior views never inherit the vehicle's roll
  or pitch. They use a smoothed, roll-independent heading (`GroundHeading`): the nose
  projected onto the ground while the car is upright. While it tumbles (on its side or roof,
  nose steeply up or down, or rolling fast), the heading holds or follows the line of travel
  and turns at most `tumbleMaxYawRate` (1.2 rad/s). Once the car has settled upright it eases
  round to the new nose. The overhead view follows its centre point with a critically damped
  spring that is calmer while tumbling, so a multiple rollover is followed smoothly from above
  instead of shaking side to side.
- **Cinematic** is a slow drone orbit: one full turn every `cinematicOrbitSeconds` (48 s)
  at about 2.4× the vehicle's chase distance (minimum 9 m), slightly above (`cinematicElevation`)
  with a gentle vertical drift and a longer 38° lens. It starts behind the current heading,
  keeps the vehicle centred, filters suspension bounce from its height and pulls in front of
  physical obstructions like the chase camera. The wheel scales the distance (0.5–2.5×).
  Driving controls are unchanged; it is meant for showing the scene off, not for precise
  driving.
- Both views keep the pointer rule: the game still owns the mouse while playing and **Esc**
  frees it. Leaving or boarding a vehicle keeps an overhead or cinematic view (boarding a
  car still switches to the driver view, as before).
- Hosts read the active view from `canvas.dataset.cameraMode`: `first-person`, `chase`,
  `cockpit`, `map` or `cinematic`. Tuning lives in `GameCameraSettings`
  ([configuration](configuration.md#camera-example)).

## Monitor flight and sidearm

Play starts in first person outside vehicles. **C** (gamepad **B**) cycles first person,
third person, overhead and cinematic (see [Camera modes](#camera-modes)). The compact monitor
body hovers 1.25 m above nearby ground, following curbs and ramps without jumping.
Walls and ceilings remain solid. Over a drop it falls under gravity, then brakes
above the surface below to recover normal clearance. **Space** gives one upward
impulse followed by a fall; it does not select a permanent height. The library's default walking controller remains available; the playground
selects `new Simulation(scene, { playerMode: 'hover' })`.

The weapon starts holstered. **Tab** draws or holsters it while on foot; holstered clicks do not fire. With the mouse captured
(see [Mouse capture](#mouse-capture)) the mouse aims without holding a button and **left-click** fires one shot per press (the trigger
resets on release). Hold **right-click** for aim-down-sights (raises and centres the pistol for iron sights); release to return to the
hip pose. There is **no UI crosshair** — aim with the pistol. **H** toggles a laser sight (beam from the muzzle plus a surface pin) while
the weapon is drawn; in a vehicle **H** still steps the lights (posición → cruce → apagadas).

The equipped preset is the **HK USP Compact in 9 mm x 19** (`assets/library/weapons/hk-compact/hk-compact.json`, sources cited there;
`TODO(unverified)` marks anything without one). It behaves like the pistol: **13 + 1** rounds, semi-automatic, the slide locks back on the
empty magazine, and **R** reloads (drop the magazine, seat a full one, release the slide — about 1.6 s; a reload with a round still
chambered keeps it). Each shot plays a synthesized gunshot, ejects a brass case to the right that bounces and tinkles, and adds muzzle
rise to the aim that only partly comes back on its own. The bullet follows the published trajectory of a Federal American Eagle 124 gr
FMJ (drag fitted to Federal's velocity table, zeroed at 25 yd) and stops at the first solid, handing it the bullet's momentum; a hit
leaves the surface mark and a brief spark burst. A short, dim muzzle flash shows in first person. Drawing, holstering and boarding do
not change mouse capture; **Esc** frees the mouse and the next click on the viewport recaptures it without firing. In third person the
monitor's aim is checked against obstructions. Firing is disabled while driving or editing. Shots can cross one open/window portal.
There is no damage model and no multiplayer.

## Carrier Stargate controls

The container's bow and stern frames now carry their own mouths. Walk/hover up to
a frame: its nearby panel offers a destination selector and **Abrir / Cerrar**.
Click the panel (or press **Esc**) to free the mouse for its buttons; click outside it to recapture. Destinations are the
compatible Stargates already present in this scene; add road mouths with
**ESCENA + → Stargates** while stopped. Choose a destination, then open the connection.
Closing retains its address; switching destinations closes old links atomically.
A frame occupied by an actor cannot be closed or relinked.

The two carrier mouths can have independent destinations. Closed carrier mouths
leave the original opening available for normal garage access. Activating the
stern mouth levels the ramp to keep the car at aperture height. Release the A3
from its garage latch before backing through this mouth. Bow access is for the
monitor around the existing helm and partition. Gameplay connections are runtime
state; author and save initial links from the inspector while stopped.

## Walking inside a flying carrier

Release the flight controls and wait for the carrier to stop. Press **E** to leave
its helm: the monitor stays inside, with camera, movement and hover height relative
to the cabin floor. The flight controller continues holding the carrier at altitude.
Press **E** near the helm to take control again.

Open a carrier Stargate to a ground gate using its nearby console. Walk through
to the ground and return through the paired gate: the carrier remains aloft and
you return to its interior. This uses the existing physical cabin, not a CSS room.
Car release at altitude remains outside this prototype; landing is still required
to unlatch cargo safely.

## PNG sprites and the window gallery

**ESCENA + → Sprite** adds a transparent tree. Set its local PNG URL and width/height in the
inspector; position its origin at the trunk's foot. Trees turn toward each rendering camera only around the vertical axis, including
the remote portal camera. They remain standing when viewed from above. Tree PNGs
use subdued foliage colours and fixed translucent ground silhouettes; these
decorative shadows do not follow the Sun. Target sprites still face the camera
fully. Neither has a physical collider.

**ESCENA + → Galería 2.5D** adds a separate target stage and a window near the starting area
(at X −1, Z −4). Approach its front from positive Z, capture the mouse, and shoot
through it. Move sideways to see the perspective change between tree and target
layers. Window mode blocks bodies but lets shots through. The first gallery shot
starts a 60-second round; targets reappear after 1.5 seconds. **N** restarts it.
This is a playable target-gallery prototype, not a complete Operation Wolf game.

The **+** beside the **ESCENA** entity count holds all creation actions, including
Stargates and the 2.5D gallery. Selecting an object in the viewport expands its
ancestor groups and scrolls its selected tree row into view. The creation menu
closes after choosing an item, clicking outside or pressing Escape; creation is
disabled while playing.

## Building geometry

Use **Scene + → Edificio**, then **Editar geometría** in the inspector. Points, Lines and Planes place snapped local geometry; the drawing plane and offset choose the construction surface. Select a face to extrude or delete it. Escape finishes geometry mode. See [Solid editor](solid-editor.md) for topology, cloning and current limits.

## Irun Ventas

New sessions start in the real-data district. **Irún · Ventas** restores its baseline;
**Escena A3** opens the original test circuit. **F8** starts play and **E** enters the
nearby A3. The carrier is placed nearby; enter its helm and use **V** to switch flight
mode, then the existing lift/flight controls. Buildings under **Edificios OSM** use
the same color and geometry editor. Save preserves a local snapshot. GPS relocation
is disabled for this geographically anchored extract. The viewport labels its
1.2 km extent; ground movement is constrained at the available terrain boundary.

## Performance and inspector sections

Open **Opciones → Rendimiento** in the header to choose drawing distance (1, 2, 4 or
6 km), map collision radius (200, 400, 800 or 2000 m), pixel ratio cap (0.75, 1,
1.25 or 2) and shadow map resolution (off, 512, 1024 or 2048). Defaults are 4 km,
400 m, 1.25 and 1024. Preferences and each settings section's open/closed state
are stored locally in the browser, separately from the scene document. **Archivo** contains opening JSON, saving locally, exporting JSON and loading starter scenes.
**Opciones** contains performance, Sun/Moon and Earth location. **Ayuda** contains controls.
The right inspector contains only selected entity properties. Menus close on Escape or
outside click; Tab navigates their controls without starting play. Opening a menu clears
movement input; gamepad and keyboard flight commands stay neutral while it is open.

Drawing distance limits loaded map objects and real-world fog; it does not download
buildings out to that radius. Coarse terrain fills the surroundings. Mesh frustum
culling already skips geometry outside each camera's view; portal cameras evaluate
their own distance visibility. Lowering resolution or disabling shadows can reduce
GPU work even when nearby buildings fill the screen.

Map building collisions outside the selected radius are suspended, with two seconds
of speed-based margin around the player and every vehicle. The check runs four times
per simulated second. Altitude contributes to distance, so remote buildings below a
flying carrier can be suspended. Terrain, authored solids, vehicles and portal
colliders stay active, including surroundings of parked vehicles. Portal exit checks include suspended
obstacles and reactivate nearby collisions immediately after traversal. This does not
reduce scene storage or terrain physics; it is not a benchmarked frame-rate guarantee.

Normal horizontal carrier flight targets 277.78 m/s (1000 km/h), with up to 60 m/s² of
acceleration. Releasing the right stick or applying the brake targets zero horizontal
speed, with up to 90 m/s² braking. Diagonal input has the same speed limit. Vertical
speed remains 3 m/s with altitude hold, and Shift retains accelerated geographic ascent.

## Travel to another city

Open **Ir** in the header. Choose a destination or enter latitude/longitude, then
press **Cargar destino**. This downloads a new 1.2 km district with OSM buildings,
roads and Esri terrain, the A3 and the carrier. Geographic coordinates describe the
district centre; this is not a worldwide imagery-only repositioning of the old scene.
Latitude is limited to ±85 degrees for the map projection.

A trip stops play and replaces the editor scene only after data generation succeeds.
Use **Deshacer** to return to the previous scene, or save/export it for durable storage.
The loading status supports cancellation and retry; failures preserve the old document.
Cold destinations can take several minutes depending on the upstream provider. A temporary HTTP 429/502/503/504 response is retried once; cancellation remains immediate.
The new district starts streaming its neighbors when play resumes. City presets are
coordinate shortcuts and do not ship predownloaded city models. No geocoding service
or additional map provider is used.

Invalid imported building topology is omitted after rounding, and its count appears
on the OSM building group. Other buildings, roads and terrain continue loading. Authored
solid validation remains strict; this tolerance only applies to map generation.

## Bullet impact marks

Each shot also draws a short muzzle-to-impact tracer streak that fades within about
90 ms. Impact discs are unchanged.

Shots against physical surfaces leave a small black circular mark. The most recent
64 marks are retained for the current play session, replacing the oldest when full.
Marks follow moving hit entities and use the same portal-transformed ray as damage;
aim probes and misses do not leave marks. They are removed when their map zone unloads,
when play stops or when the scene changes, and are not saved in scene JSON.
These are simple surface-aligned discs with shared geometry/material, not holes or
geometry damage. Sprite targets retain their existing hit/respawn behavior.

### A3 dashboard

The A3 driver's eye anchor is 15 cm below and 26 cm forward of the seat reference
(5 cm lower than the previous cockpit). The instrument cluster has a white digital
speed readout in km/h. The original navigation display carries a blue local road
chart without labels, at 4× the carrier chart zoom (one quarter of the distance
across each axis). Speed digits use a compact 50 px canvas font. It reuses the carrier chart at 4 Hz through a canvas texture,
without an additional scene camera or network requests. No-road scenes retain the
blue grid and vehicle marker.

The car's position lamps, navigation chart and speed digits switch off when the
player leaves the driving seat. Lower outer rear lenses light red while braking;
lower inner lenses light white when reversing. The upper strips are amber turn
signals: **comma** toggles left and **period** toggles right; press again to cancel.

The two side mirrors reflect the scene only while driving that car in cockpit
view. Visible mirrors update at most 8 Hz into 384 × 256 targets, without recursive
portal/mirror captures or additional shadow-map updates. Exterior, overhead,
on-foot and editor views do not render mirror passes. Hidden browser tabs skip them.

Mirror captures aim from the eye position at the complete lens. Turning the head
changes visibility, not the captured perspective; translating the eye or moving
the vehicle still changes the reflected view.

### Continuous map residency

Generated terrain carries a fingerprint of its original map entities. Saving or
reopening a scene no longer pins every downloaded sector: distant unchanged zones
can be evicted to make room, while edited zones and sectors near vehicles/portals
remain protected. Legacy saved zones without fingerprints are compared with their
generated source before they can be evicted; failed comparisons keep them intact.

Moving does not cancel an in-flight sector download. It finishes populating the
cache, and is installed only if still wanted; the next request uses the latest
position. Stopping/replacing the scene still cancels its loader. This prevents fast
flight from repeatedly aborting cold sectors, but does not guarantee that public
map providers can deliver unseen terrain ahead of a vehicle at 1000 km/h.

Carrier screens stay active throughout the occupied interior, without a proximity requirement. Use **K** to release the mouse for native CSS clicks. Driving controls still require the pilot seat. The carrier eye and monitor anchor sit 10 cm lower and 20 cm behind the authored pilot reference.

### Nabla S3 custom preset

The grey cabrio keeps its lightweight body and Nabla emblems, with a custom 400 CV
(294.2 kW crank power), 520 N·m AWD powertrain and seven-speed DSG-style automatic.
These are game tuning values, not a manufacturer specification. Drive with W/S
and A/D; the HUD shows D1–D7 or R and engine RPM. Opposite throttle brakes to a
standstill, holds for a moment, then engages reverse with an audible clack; every gear
change clacks too. Space briefly loosens the rear axle to initiate a slide; release
it to recover grip. Hold W + Space near rest for a rear-tire burnout (front brakes
hold the car, the AWD coupling sends torque rearward). Smoke is contact-gated and
limited to 96 particles. The sound button also mutes the synthesized car exhaust.
The Bilbao police Focus drives only its front wheels. Saved stock presets upgrade
on load while preserving their paint, placement and custom names/tuning.

### Retractable S3 GPS

Press **G** while driving the S3 to lower or raise its GPS screen and casing.
Travel takes 1.8 seconds; another press reverses the motion from its current position.
Lowering immediately turns the screen black and stops map redraws/texture uploads.
Raising refreshes the map and restores it. The speedometer stays active.

### Layered car menu

Press **J** in the S3 to open its GPS console menu in cockpit view. Use **Up/Down**
and **Enter** to choose a paint colour; **J** or **Escape** closes it. Driving input
is held neutral with the brake applied while the menu has focus. The colour change
is a normal scene edit; use **Save** to persist it. Retracting GPS with **G** closes
the menu. Its layers and actions live in `src/catalog/monitors/car.ts`; the reusable
monitor contract is documented in `src/render/monitors/README.md`.
