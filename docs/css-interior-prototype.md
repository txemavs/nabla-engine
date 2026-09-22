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

The three upright screens show telemetry on the left, a north-up local road chart
in the centre, and stern portal controls on the right. Telemetry shows speed,
altitude (metres, or kilometres above 1 km), pitch, roll, flight mode and cruise
limit. It uses the simulation's altitude datum, not an independently measured
AGL sensor. The chart uses already loaded road vectors, a heading marker and a
200 m scale. It updates at 4 Hz in a 580 × 230 canvas; it does not render the 3D
world a second time or request network map tiles. Empty areas are labelled when
no roads are loaded; this is not a satellite or terrain-height map.

The desk has a horizontal 2.43 × 0.40 m touchscreen, set forward to leave about
16 cm of bare desk between its rear edge and the upright screens. Two circular
D-pads reproduce mode-2 drone controls: left W/S controls climb/descent, A/D yaw;
right arrows control forward/back and lateral movement. The central desk switches
control flight/ground mode, garage door, cruise-speed limit and braking. Both
hands can hold separate pointers. Motion requires piloting this ship in flight
mode; releasing/cancelling a pointer, losing focus, changing pointer lock or
leaving range releases held input. Keyboard and gamepad remain available.

Screens activate within one metre of the centre console, or while piloting in
cockpit view. Press G for native HTML interaction. In edit mode, **Options →
Carrier console** (**Opciones → Consola de la nave**) frames the helm. The former
side-wall drawing demonstration is replaced by these controls.

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
