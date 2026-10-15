# Engine VR and Quest 3

`GameRuntime` from `@nabla/engine/runtime/browser` now owns `runtime.xr`.
After `await runtime.play(...)`, call `runtime.xr.enter()` directly from a user
button gesture. `exit()` leaves immersive mode; `recenter()` recalibrates the
floor-space origin and eye height. Hosts own button placement and error messages.
A top-right page button exits VR. Inside the headset, a head-mounted “Salir de VR”
target highlights when aimed at with either tracked controller; its trigger ends
the session without firing the weapon for that captured press.
Both `game/drive.ts` and `game/terrain-main.ts` bind the same entry button, so
`test.html` and the Euskadi host use the same session, simulation and streaming.

- `/xr.html`: the test fleet and floor, with the minimal quality preset by default.
- `/test.html?example=flat`: existing desktop test with an additional VR button.
- `/xr.html?terrain=/terrain&tile=16224/11998&photo=lo&relief=engine&quality=minimal&time=12:00`:
  the Zaisa Z15, when the server publishes that package under `/terrain`.
- `/xr-demo.html`: preserved finite pointing/pistol calibration demo below.

Set `NABLA_TERRAIN_DIR` to a local package root to use the existing Vite terrain
mount. The local Quest test mirror is ignored in `local-backup/quest/terrain`;
it is not bundled into the Engine or uploaded to the online host. The production
build includes all four HTML entries. Deploying that build is a separate action.

## Quality menu

X on the left controller opens and closes the immersive quality touchscreen.
The page has the same quality controls, with calibration and scenario tools
under Development. Resolution scale (50–150%), peripheral foveation, smoke and
sparks, shadows, and road texture anisotropy are saved locally. Foveation and
effects change live; Apply exits VR and reloads for profile, scale and shadow
allocation changes. Enter VR again after applying.

The Road · Quest preset uses low vehicle assets, no buildings or shadows,
100% XR scale, 50% peripheral foveation, and 16× texture anisotropy. Actual
anisotropy is limited by the device. Compare FPS on the same route and view.

## Performance trials

The XR scenario menu offers eight isolated trials: car, VFR800, truck without
trailer, and carrier, each on the flat test floor or the Zaisa Z15. `solo=1`
loads only the selected vehicle assembly, disables the demo fleet, extra host
vehicles, preload fleet and accident replacement fleet. Flat isolated trials
start in the vehicle and keep the test pistol in the chest holster.

A small head-mounted panel and the page output show app callback FPS, p95 frame
interval, average CPU submission time, physics time, triangles and draw calls.
Counters update once per second, with fresh sampling on VR entry/exit. Render
counts are reported as returned by Three, without multiplying them again for
stereo. These are not compositor FPS or GPU timings. Compare the same vehicle
on the flat floor and Zaisa, with the same headset refresh rate and view, to
separate vehicle cost from terrain cost. This change does not simplify terrain.

## Shared gameplay controls

| Quest input            | Walking                                | Vehicle                                      |
| ---------------------- | -------------------------------------- | -------------------------------------------- |
| Left stick             | Walk/strafe relative to head direction | Steer                                        |
| Right stick horizontal | 30° snap turn                          | Flight roll when in flight mode              |
| A                      | Enter vehicle / pick up                | Leave vehicle                                |
| B                      | Jump                                   | Brake                                        |
| X                      | Open/close quality menu                | Open/close quality menu                      |
| Y                      | Shared R action                        | Recover vehicle                              |
| Left stick press       | Crouch                                 | Toggle flight mode                           |
| Right stick press      | —                                      | —                                            |
| Right trigger          | Fire if right hand holds pistol        | Accelerate                                   |
| Left trigger           | Fire if left hand holds pistol         | Brake/reverse through shared signed throttle |
| Left squeeze           | Grab pistol / magazine / slide         | Grab steering wheel while held               |
| Right squeeze          | Grab pistol / magazine / slide         | Grab steering wheel while held               |

Flight uses the same mode-2 axes as desktop gamepads: left stick lift/yaw,
right stick forward/roll. The HK uses the shared firearm and ballistic pipeline,
with a tracked grip mount tilted 90° down. Shots follow the barrel, including at a
floating origin. Discharge, dry fire, magazine/slide sounds, ejected brass,
flash/light, smoke, heat and impacts use the same gameplay path as desktop.

XR carries two independent pistols in left/right hip holsters. Either hand can
hold either pistol, including both at once. Hold squeeze near a grip to draw;
release to return the pistol to its own holster. The free hand can squeeze the
magazine to extract it, or the slide to pull it continuously. Each trigger fires
only its own held pistol and is excluded from vehicle pedals while occupied.

One normal magazine starts on the left chest, one long magazine on the right.
Hold squeeze to pick one up; release it near an empty magazine well to insert it,
near an empty chest pocket to store it, or elsewhere to drop/throw it. Dropped
magazines remain collectible. Each retains its identity and remaining rounds;
pockets never generate replacements. Insertion does not chamber a round: rack and
release the slide when needed. The long magazine selects the existing experimental
automatic mode. X/Y no longer perform magazine shortcuts while holding a pistol.

Recoil animates the weapon without rotating the headset. Audio unlocks when
entering VR and retains the user's mix settings. Interactive cockpit panels are
not yet ported to XR.

The immersive scheduler replaces the desktop RAF while the session is active;
it does not inherit a desktop FPS cap. Tracking loss or a blurred/hidden session
releases input. Camera ownership and desktop scheduling are restored on exit.
The XR eye is relative to the shared standing/driver pose, with physical head
motion added by WebXR. Physics still represents the joystick-driven avatar;
room-scale collision correction remains future work.

The initial stereo pass renders the shared SceneView and terrain directly.
Desktop postprocessing, mirror/portal views, CSS monitors and shadow passes are
excluded; the background is a simple sky colour. This is an initial Engine XR
path, not a claim of complete desktop effect parity or measured Quest performance.
Automated checks cover input mapping, session lifecycle, pose ownership and an
emulated session using real gameplay physics. The new gameplay/Zaisa path still
requires validation on the physical Quest 3. OSM information panels are deferred.

---

## Preserved pointing and HK demo

This finite test host covers viewing and controller pointing from [issue #64](https://github.com/txemavs/nabla-engine/issues/64).
Open `/xr-demo.html` on the standalone game server. The page reuses the Engine A3
preset and public SceneView, with an explicitly synthetic 40 m floor and a 1 m
grid. Three synthetic blocks and the A3 are selectable targets. The existing HK
USP Compact is mounted on the right tracked grip. It does not load city tiles,
start world physics, or modify saved scenes.

## Run and serve

From the Engine directory:

```sh
npm run build
npm run dev
```

Desktop preview: `http://localhost:5174/xr-demo.html`. The production game build also
includes `xr.html` and `xr-demo.html`: `npm run build:game`. Serve the complete output folder,
including the bundled vehicle assets, under a trusted HTTPS origin.

Quest must trust the HTTPS certificate. A PC's `localhost` is not the headset's
localhost, and plain `http://192.168.…` does not enable immersive WebXR. Use a
trusted HTTPS host/reverse proxy, or supply a certificate and key for the actual
LAN hostname/IP using these environment variables before `npm run dev`:

```powershell
$env:NABLA_HTTPS_CERT = 'C:/certificates/nabla-cert.pem'
$env:NABLA_HTTPS_KEY = 'C:/certificates/nabla-key.pem'
npm run dev
```

Open `https://<hostname-covered-by-certificate>:5174/xr-demo.html` in Quest Browser.
Both variables are required together. Certificate creation, trust installation,
firewall changes and hosting credentials are not automated by this demo. For local testing, Meta documents accepting the self-signed certificate warning
in Quest Browser: [testing guide](https://developers.meta.com/vr/documentation/iwsdk/guides/02-testing-experience/).
Confirm immersive entry on the physical headset; desktop checks alone cannot validate it.

## Headset walkthrough

1. Wait for the car to finish loading, then press **Entrar en VR**. This user
   gesture requests `immersive-vr` with required `local-floor` support.
2. The car is four metres ahead of the initial floor origin. Head height comes
   from the headset; the demo never substitutes a fixed eye height. Check the
   one-metre grid and car scale, both standing and seated.
3. Left controller: aim its cyan ray at the A3 or a test block. The hovered object
   gets an outline; the **left trigger** selects it (gold outline and panel label).
   The **left grip/squeeze button** recenters horizontal position and yaw, preserving
   floor height. The left controller uses a lightweight local geometric model.
4. Right controller: the existing HK follows `gripSpace`, aligned by its authored
   `GripSocket`. Its ray starts at `MuzzleSocket`, independently of head orientation.
   The **right trigger** fires once per press; the **right grip/squeeze button**
   reloads. The shared Sidearm owns ammunition, trigger reset, slide and magazine
   animations. A brief impact marker and optional haptic pulse confirm the shot.
   This test uses visual ray hits, not the game's ballistic/physics or audio pipeline.
5. Read the world-space panel. It reports callback cadence, interval p95 and CPU
   submission time once per second. These are not GPU timings, compositor frame
   delivery, or a comfort guarantee. DOM diagnostics also show draw calls after
   leaving VR. Tracking/reference-space resets request a fresh recenter.
6. Leave through Meta's system menu; the desktop **Salir de VR** button also
   ends the session. Check that orbit navigation works again, then reenter VR.
   Denying permission should leave the entry button usable for another attempt.

The renderer uses a single `setAnimationLoop` for desktop and XR, no desktop FPS
cap, 0.8 XR framebuffer scale and requested maximum foveation. Shadows, mirrors,
portals, postprocessing and the logarithmic depth buffer are absent. These are
starting settings for measurement, not a validated Quest 3 performance profile.
Recenter uses the base floor space, rather than accumulating previous offsets.

## Acceptance evidence

Automated lifecycle tests cover duplicate entry, permission denial, renderer
setup failure, late permission after disposal, reentry and floor-preserving
recenter. Interaction tests cover occlusion, handedness, selection, grip alignment,
trigger release on tracking loss and input suppression after exit. Browser tests
verify packed A3/HK asset loading, rendering and unavailable-XR
messaging. Neither substitutes for this hardware checklist:

- [x] User confirmed the initial car/floor view looks correct on Quest 3 (2026-10-14).
- [ ] Validate controller pointing and HK grip alignment on the physical Quest.
- [ ] Floor, scale and recenter are correct while seated and standing.
- [ ] Left squeeze recenters; Meta menu exits; reentry works.
- [ ] Right trigger fires once per press; reload and loss of tracking leave no held input.
- [ ] Record callback interval p95 and CPU time over a one-minute stationary run.
- [ ] Repeat after leaving/reentering and after a headset tracking interruption.

Driving, cockpit seating, bare-hand tracking, city streaming and real building data
remain subsequent milestones of #64. This page is a test host, not WebXR support
in Studio or GameRuntime.

Controller roles come from `XRInputSource.handedness`, never connection order.
Bare hands and gaze sources are ignored in this controller milestone. Session
exit, disconnection and tracking loss release the trigger and hide the weapon.
`Sidearm.syncTracked` accepts an ordinary Three object; it does not import WebXR
or perform a separate camera/render pass.

### Añadir celdas durante la prueba

En Zaisa, **Añadir Z15 cercano** conserva la celda actual y añade la celda pendiente
más próxima a la posición del jugador (distancia a su borde). Excluye la celda
que contiene al jugador y las ya visibles; cada pulsación puede aumentar el conjunto.
Las celdas añadidas quedan retenidas para comparar carga acumulada, hasta recargar
la página. El botón existe también dentro del casco y se pulsa apuntando con el
mando y usando el gatillo. Muestra el número de celdas al terminar.

`GameRuntime.loadNearestZ15(baseUrl, onProgress)` usa el mundo existente, descarga
con el trabajador de terreno y reparte la instalación en pasos; no cambia de escena
ni termina la sesión XR. La incorporación de mallas y su subida a la GPU aún pueden
producir tirones: segundo plano no significa coste nulo. Un error conserva las
celdas anteriores. En la pista plana pide entrar primero en Zaisa.

Para este PC, el servidor HTTPS de `local-backup/quest` conserva `/terrain` como
copia local y expone `/terrain-extra/z/15/…` mediante proxy HTTPS de solo lectura
a Atlas. `VITE_TERRAIN_EXTRA=/terrain-extra` selecciona ese origen para las
pulsaciones en `/terrain`; otros servidores de terreno siguen usando su propia URL.
Así los vecinos solo se solicitan al pulsar, sin descargar toda la zona al arrancar.

### Controller gloves and grab diagnostics

Controller placeholders are replaced by lightweight articulated gloves. Squeeze curls
the fingers; trigger curls the index finger. They mirror left/right and disappear
when tracking is lost. They use controller input, not optical hand tracking.
The current viewer pose is copied before gameplay attaches the chest holster; the
camera must not be reset to floor height before the stereo render.
The stats panel includes `Agarre v2`, tracked hand count, pistol location and
distance from a hand to the actual steering-wheel mesh (or `Volante agarrado`).

The XR host equips the chest pistol in every scenario, including solo vehicle tests. It remains visible when seated and always returns to the chest on release. A pistol trigger does not simultaneously operate a vehicle pedal.

### Minimal XR HUD

The headset HUD now shows only **X** (exit), **+** (add the nearest unloaded Z15)
and application FPS. Detailed CPU, triangle, tracking and grab diagnostics are no
longer displayed. Desktop button tooltips retain the terrain load result.
Ballistic impact marking uses a neutral ray camera rather than copying the
asymmetric XR eye projection, so the mark ray follows the bullet's impact direction.

## Pose calibration

Open **Ajustes VR** in the browser page before entering the immersive session.
The selector includes both glove models, the pistol grip pose for each hand,
each individual pistol, both holsters and both chest magazine pockets. Every
entry has local X/Y/Z offsets in centimetres and X/Y/Z rotations in degrees.
Zero means the existing authored pose. Hand adjustments change the glove model;
grip adjustments change the weapon mount. Tracking coordinates remain untouched.
Holster and pocket adjustments move their contents and pickup locations together.

Values persist per browser/origin. **Restablecer objeto** resets only the selected
entry. **Compartir ajustes** opens the system share sheet when supported;
**WhatsApp** opens a prefilled message for the user to choose its recipient.
**Copiar ajustes** and **Descargar JSON** export the same values and units.
The browser panel and the immersive touchscreen share the same calibration state.

The `2026-10-14-user-zero` baseline bakes the user's shared hand, holster, pistol
and chest-pocket poses. Calibration exports are version 2 and identify this
baseline. Browser storage uses `nabla.xr.calibration.v2`; old V1 values remain
stored for recovery but are not reapplied. All V2 controls initially read zero,
and resetting an object returns it to this approved posture.

`pistol-0` / `pistol-1` now adjust only the pistol in its holster. Each hand uses
its own `grip-left` / `grip-right` mount without inheriting either holstered
pistol adjustment. The former grip −90° and shared pistol +90° rotations are
composed into the new in-hand baseline, preserving the approved held pose.

## Giant XR touchscreen

The host enables a 2 × 1.25 m calibration screen inside the stock black portal
frame. Its face is the shared `HtmlMonitor` WebGL texture, using the local HTML
at `assets/monitors/xr-calibration.html`; it is not a CSS3D overlay. The screen
opens in front of the player on first VR entry and stays at its world position,
including floating-origin shifts. Close it with its X. The head-mounted gear
icon or the browser's **Pantalla grande en VR** button brings it in front again.

Touch with the controller glove's actual index fingertip or the held pistol's
muzzle. An empty hand also uses its controller aim ray and trigger. The object
selector opens a touch list; +/- adjust centimetres or degrees with a fine/coarse
step. Changes use the same saved V2 zero and can be shared from the browser panel.
Contact triggers once and rearms after withdrawal. Armed hands do not ray-click.
While a pointer interacts, it is excluded from driving/UI-conflicting controls;
a trigger consumed by the screen cannot shoot until it has been released, even
if the screen closes. Grip ownership is retained for held pistols and magazines.
The template rasterises on changed values with the existing adaptive throttle.

### Moto: puños físicos y gas de muñeca

En XR, la moto se conduce manteniendo el agarre lateral cerca de cada puño.
La posición de las manos gobierna la dirección, también con una sola mano.
El puño derecho fija gas cerrado al agarrarlo; girar la muñeca abre el gas.
Soltarlo, perder seguimiento, salir del vehículo o suspender la sesión corta el gas.
El gatillo derecho acciona proporcionalmente la maneta delantera y el izquierdo
el pedal trasero, únicamente mientras esa mano sujeta su puño. Se conserva el CBS
del modelo físico. Las manos ocupadas por un arma o cargador no operan el manillar;
una mano que sujeta el manillar tampoco recoge armas ni pulsa la pantalla.

En Ajustes VR: «Moto · gas, dirección y frenos» ofrece recorrido de gas (45°),
zona muerta (3°), recorrido de dirección (30°), ganancia de cada freno (100 %)
y sentido del gas (+1/-1). La pantalla muestra porcentajes de gas/frenos y agarres.
«Moto · puño izquierdo/derecho» ajusta el punto de agarre en centímetros;
los giros del puño derecho ajustan el eje del acelerador.
Suelta y vuelve a agarrar para fijar otra postura de gas cerrado.
Los ajustes se guardan y se incluyen en el JSON compartido; los controles de la
moto usan unidades propias declaradas en `controlUnits`.
