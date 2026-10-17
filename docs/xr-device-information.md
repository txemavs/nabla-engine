# XR device and input information

The AR launcher and standalone demo expose a local, copyable report using
`inspectXRDevice` from `@nabla/engine/ar`. Browser user-agent hints are explicitly
probable, never a reason to allow or deny a session. Support for immersive VR does
not prove that the device is a headset.

Before entry the report lists VR/AR support and ordinary gamepads. After entry it
adds environment blend mode, interaction mode, visibility, granted features,
input-source profiles, handedness, hand tracking, and button/axis counts. Plane and
mesh counts are sampled from active frames once per second; zero detected objects
is different from an API that is not exposed. The launcher retains the last session
report after exit. The in-world Environment menu can show the current report too.

Ordinary gamepads and XR inputs are enumerated separately. The browser may withhold
a gamepad until the user presses a button. Gamepad API does not reliably expose
USB versus Bluetooth transport. Detection alone does not bind that controller to
AR gameplay actions. No Bluetooth scan or additional hardware permissions are used.

The existing AR demo still requires `unbounded` and `local-floor`. A phone advertising
immersive AR may not provide those reference spaces. Mobile AR interaction and
reference-space fallback remain separate work; this report does not claim to add them.

Standards: https://www.w3.org/TR/webxr/ and https://www.w3.org/TR/gamepad/.

## Touching the monitor on a phone

Engine listens to native XR `select` events only for input sources whose
`targetRayMode` is `screen`. The event's tracked ray is transformed into the scene
and tested against the existing monitor face (the same five-metre range as the
controller ray). It invokes the same pixel action, click feedback and menu logic.
Tracked controllers, hands and gaze retain their existing paths; no user-agent
heuristic enables this interaction and no separate HUD is created.

A screen tap while the monitor is closed recalls it in front of the viewer.
While open, a tap outside the monitor does nothing. Sessions without a tracked
input pose cannot activate buttons. Listeners are removed on exit/disposal.
This adds button selection, not touch dragging or freehand drawing on the board.

## Vehicle touch controls

`ARTouchControls` reuses Engine's `TouchDriving` and `TouchFlight` components.
The AR host supplies its root as an optional DOM overlay when requesting the
session. Controls activate only for screen-space sessions (or screen XR input)
with a granted overlay; headset input remains unchanged. Without DOM Overlay,
the demo reports the missing capability instead of claiming the controls work.

Road controls feed the existing scaled-vehicle simulation axes. Helicopter/drone
controls feed the existing Betaflight adapter with Mode 2 axes; they do not create
another physics simulation. The menu button recalls the same monitor. Opening it
clears touch inputs and disarms the helicopter; losing tracking also clears controls.
The flight play button toggles arming. Touch UI prevents XR selection events on
its controls so steering does not simultaneously press buttons on the 3D monitor.

### Landscape mobile controls

The screen-session DOM overlay enlarges Engine touch controls to 1.8×, anchors the
accelerator to the left and the wheel to the right, and reserves a row underneath
for object actions. Short or portrait viewports reduce the scale to avoid clipping.
This layout does not change headset input or the ordinary game HUD. It adapts to
screen orientation; it does not force a browser orientation lock.

`ARTouchControls.setActions` accepts named, accessible icon actions supplied by the
controlled object. `ARRC.touchActions` invokes existing vehicle audio/simulation
commands; the demo supplies the drone's arm action. The action row is rebuilt only
when the controlled object changes and is hidden while the monitor is open.

### Separate AR entry modes

`headset.html` offers AR for headset and experimental AR for mobile. The `arMode`
query parameter (`headset` or `mobile`) explicitly selects the experience, including
when opening `ar.html` directly. Without it, known headset user agents take priority
over Android; phone/tablet hints select mobile, and unknown devices default to
headset. This is a hint, not proof: the selector remains available and WebXR AR
support is still queried independently before enabling entry.

Only mobile mode supplies a DOM overlay and enables native screen taps. Headset
mode retains controller/hand monitor input without requesting the mobile overlay.
The session's actual screen input and overlay support still gate mobile controls.
