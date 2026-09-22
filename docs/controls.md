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
| Play / stop           | Jugar / Detener / Tab                            |

Reparenting preserves the world transform. Groups can be expanded in the scene
tree. Saving stores the authored document, not the runtime physics state.

## Hovering and driving

| Action                                            | Keyboard                                |
| ------------------------------------------------- | --------------------------------------- |
| Hover / drive                                     | WASD or arrows                          |
| Look around                                       | Click the viewport, then move the mouse |
| Release pointer                                   | Esc                                     |
| Accelerate                                        | Shift                                   |
| Handbrake in vehicle                              | Space                                   |
| Enter / exit                                      | E                                       |
| First / third person; vehicle camera cycle        | C                                       |
| Latch / release cargo                             | F                                       |
| Transfer controls between latched car and carrier | T                                       |
| Restart play                                      | R                                       |

Entering requires proximity and a nearly stopped vehicle. Exiting requires low
speed and a free exit volume. Cars require supporting ground; a carrier with an
interior places the monitor beside its helm, including while hovering at altitude. Blocked exits
leave the player inside and display a status message.

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

## Flight: mode 2

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

The cockpit eye sits 0.26 m forward and 0.10 m below the authored driver anchor
in ordinary cars; the carrier cockpit is unchanged. This is a host camera offset,
so existing saved A3 scenes receive the improvement without rewriting their data.
The cockpit position and orientation are rigidly attached to the interpolated
vehicle pose, including pitch and roll. Mouse look rotates the head relative to
the car; its offset stays fixed when the mouse stops. Entering cockpit view or
changing vehicles resets the head to face forward. Chase view follows heading
after a short manual-look grace period, increases response with speed, anticipates measured yaw rate,
and adds a bounded forward look. Field of view and chase distance stay fixed;
speed and turn telemetry are filtered to avoid projection/framing vibration.

The on-foot avatar uses Agency's floating CRT monitor. It leans with movement and
acceleration, levels after braking and hovers gently. While driving, the monitor
sits at the same eye anchor as the cockpit camera, at its native 0.34 m size,
without hovering or banking independently. It is visible from exterior and overhead
views and hidden in cockpit view to keep the view clear. Portal transfers reset
visual motion history rather than producing a large tilt.

Press **C** (gamepad **B**) to cycle **exterior → cockpit → overhead**. The overhead
view stays north-up, follows the car from 350 m, and keeps the vehicle small on
the surrounding map. Use the mouse wheel over the viewport to adjust its height
from 80 to 2,500 m. Driving controls remain the same. Connected map tiles supply
road imagery, not extra road collisions or terrain elevation.

Rendering interpolates the physics snapshots: chassis, wheels, driver anchor and
player share the same render time. The cockpit eye height remains 0.10 m below the
authored driver anchor. The monitor screen faces forward (−Z), restoring Agency's
original orientation.

## Monitor flight and sidearm

Play starts in first person outside vehicles. **C** (gamepad **B**) toggles first
and third person; vehicle camera modes keep their own cycle. The compact monitor
body hovers 1.25 m above nearby ground, following curbs and ramps without jumping.
Walls and ceilings remain solid. Over a drop it falls under gravity, then brakes
above the surface below to recover normal clearance. **Space** gives one upward
impulse followed by a fall; it does not select a permanent height. The library's default walking controller remains available; the playground
selects `new Simulation(scene, { playerMode: 'hover' })`.

Click the viewport once to capture the mouse, then left-click to fire. The centre
reticle shows aim and briefly changes to a cross on impact. The supplied HK USP Compact body and separate slide
have muzzle flash, recoil and a visual slide cycle, with a 220 ms shot interval. Shots stop at the first
physical solid and push dynamic props. In third person, a second ray from the
monitor prevents shooting through an obstruction between the monitor and the aim
point. Firing is disabled while driving or editing. Shots can cross one open/window portal, with opaque PNG pixels participating in
aim and hit detection. There is no damage, ammunition or multiplayer yet. `playground/sidearm.ts` assembles the two original GLBs without changing aiming
or physics; the procedural model is retained as a loading/error fallback.

## Carrier Stargate controls

The container's bow and stern frames now carry their own mouths. Walk/hover up to
a frame: its nearby panel offers a destination selector and **Abrir / Cerrar**.
Use **G** to release the captured mouse for the buttons. Destinations are the
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
**Escena A3** opens the original test circuit. **Tab** starts play and **E** enters the
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
New destinations may take up to two minutes depending on the upstream provider.
The new district starts streaming its neighbors when play resumes. City presets are
coordinate shortcuts and do not ship predownloaded city models. No geocoding service
or additional map provider is used.

Invalid imported building topology is omitted after rounding, and its count appears
on the OSM building group. Other buildings, roads and terrain continue loading. Authored
solid validation remains strict; this tolerance only applies to map generation.

## Bullet impact marks

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
