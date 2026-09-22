# Carrier helm and CSS portal controls

The 5 × 10 carrier has visible floor, ceiling, side lining, structural strips and
light strips around its existing physical shell. This is not an adjustable wall
thickness editor or a separate six-sided CSS world.

## Independent portals

Each independent gate has one rear-mounted landscape tablet, centred horizontally.
Its enclosure is 620 × 440 × 8 mm; the lower edge remains at its former height.
The screen sits immediately on the enclosure, against the dark rear panel at the
back of the frame. Closed portal surfaces are black. Approach the rear tablet to
within one metre, press G to release the mouse, and use its native destination,
open and close controls. Leaving range disables it. Clicking outside recaptures
the mouse.

## Carrier helm

The original three-screen console is reused: flight/ground mode on the left,
telemetry and control in the centre, and the sole stern portal on the right. The central screen shows
actual speed in km/h and altitude in metres, a maximum flight speed selector
(0, 100, 300, 600 or 1000 km/h), and a garage door button. Selecting a speed sets
the assisted-flight target limit; it does not automatically apply throttle.

The three screens activate together near the centre console (within one metre)
or while piloting the carrier in cockpit view. G enables native HTML interaction. In edit mode,
**Options → Carrier console** (**Opciones → Consola de la nave**) frames the helm;
start play and approach or take the helm to operate it. Carrier mouths no longer
have separate rear tablets. The former side-wall point-drawing demonstration is
replaced by the helm.

The desk carries a horizontal 2.43 × 0.54 m CSS touchscreen. Hold its buttons to
climb, descend, yaw, move forward/back/sideways or brake. It accepts multiple
pointers, so vertical/yaw and lateral controls can be used together. Movement
requires the player to be piloting this carrier in flight mode. Releasing or
cancelling a pointer, losing focus, changing pointer lock or leaving activation
range clears held input. Keyboard and gamepad input remain available.

The previous external nose-camera feed and its render target are removed. This
screen uses native DOM and adds no extra WebGL scene render.

The bow is now tinted armoured glass with a matching physical collider. Existing
reference scenes retire hosted bow gates, close their remote connections and
install the glass collider idempotently. The stern portal and garage interlock
remain unchanged.

## Interior finish

`assets/world/room-skin.jpg` is the user's unchanged Agency texture atlas. Floor,
ceiling and walls sample its panel regions through mesh UVs; the painted landscape
region is not used as a fake window. Interior panels no longer emit light and
have reduced environment reflections. They cast and receive shadows; only the
lighting strips glow. Dark material tuning approximates reduced ambient light:
the renderer still uses global hemispheric illumination, not room-based GI.

## Garage interlock

The garage door animates between its endpoints at 0.9 radians per second. Opening
a stern connection from either end is rejected until the physical closing
animation finishes. Opening the garage disconnects both portal ends first; an
occupied mouth refuses that change. The manual door command also checks its
swept area. The central button reports movement and waits for completion.

When the closed door is a live portal, its collision shape serves as a level
floor apron instead of a barrier, supporting wheels until an actor's centre
crosses. The visible door stays closed behind the portal image. This remains the
existing whole-body portal transfer model, not a general solver for split bodies.
Closing the connection restores the physical door collider.

## CSS/WebGL composition

Actual HTML is rendered by CSS3DRenderer behind depth-tested alpha apertures in
WebGL. CSS world and camera transforms use pixel units for native hit testing.
Tablet content preserves 3D without overflow clipping, which would break button
hit testing in Chromium. Opaque foreground geometry occludes the display.

Only the main view gets live CSS. Portal textures see solid
standby screens; they cannot capture DOM. CSS does not receive scene lighting,
fog or shadows. Multiple overlapping CSS surfaces and transparent foreground
objects still need further composition work. Keep browser zoom at 100%.
