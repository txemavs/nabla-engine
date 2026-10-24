# 18. Cameras and input

[Manual contents](README.md)

Input devices feed logical game actions. The runtime chooses the active context:
walking, driving, flight, menu interaction, or an XR-specific interaction. Keep
binding definitions centralized so that keyboard hints, touch controls, and actual
behavior remain consistent.

`GameInput` merges supported sources; vehicle control profiles select appropriate
control surfaces and touch rigs. USB controller support adds calibration and device
mapping. Force feedback has a separate bridge/integration path and should not be
inferred merely from the existence of a Gamepad API device.

## Cameras

Camera state includes modes such as first-person, chase/cockpit, map, and cinematic
views according to context. Camera smoothing and collision avoidance are distinct
from the physical player's pose. Field-of-view adjustments must not be used to
compensate for an incorrect driver mount or model scale.

The browser runtime can author an initial camera sequence through `startCameras`.
Steps can wait for time or engine startup. Read the units: sequence delays are
milliseconds, while physics stepping uses seconds. A camera introduction should
yield to the implemented user-input cancellation behavior.

## Changing a binding

Inspect `src/config/input-bindings.ts`, change the logical binding there, and
regenerate/check the human-readable control list:

```sh
npm run controls:list
```

Then verify the relevant context and a conflicting context. For example, a key
used for a weapon on foot may have a vehicle action while seated. Hard-coding a
new key in an isolated UI event handler bypasses this shared contract.

For a wheel or joystick, calibrate axis direction, dead zones, and range before
tuning vehicle steering forces. Test disconnection and focus changes so held input
does not remain latched. The host can provide an `acceptsInput` policy when its
editor or menu owns focus.

In the local Euskadi HUD, the camera button is `CAM` with the eye icon, aligned
with FOV and Quality on the left. The FOV value displays only its number while
retaining a descriptive accessible name. These are explicit repository instructions.

## Source of truth

- [Bindings](../../src/config/input-bindings.ts).
- [Input aggregation](../../src/runtime/input.ts).
- [Control profiles](../../src/runtime/control-profiles.ts).
- [Camera state](../../src/runtime/game-camera.ts).
- [USB guide](../usb-controllers.md) and [bridge](../../tools/usb-ffb-bridge/README.md).

## Saved input preferences

Mouse sensitivity/inversion, standard-gamepad dead zone and keyboard steering response
are per-instance preferences, separate from USB calibration and authored vehicle tuning.
See [mouse and gamepad preferences](20-interface.md#mouse-and-gamepad-preferences) and
[camera, keyboard and shadows](20-interface.md#camera-recovery-keyboard-steering-and-sun-shadows)
for ranges, defaults, persistence and worker/inline behavior. The keys table remains a
reference, not a key-rebinding editor.
