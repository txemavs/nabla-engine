# Floating helmet avatar

The default player avatar replaces the previous green monitor with a bodyless flying robot shaped like the original user-supplied
LS2 FF901 ADVANT X CARBON helmet, simplified into a spherical dome, a discreet open
lower rim and an internal retractable wraparound visor. There is no chin guard. The low, wide face opening
contains a continuous dark curved screen with expressive blue eyes and mouth.
Satin plastic colour can be chosen per player. The face uses an 80 × 24 pixel matrix,
framed to keep its pixels nearly square. Portrait media can use the full screen.

The enlarged display follows a spherical guide 40 mm inside the shell and fills the face opening with a continuous black surface. The inner lining has the same open aperture as the shell, with no fixed layer crossing the face. Matte black foam with fine procedural grain lines the remaining interior. The complete helmet, including visor, support and ear covers, is compressed to 80% width through their shared parent. Rotation around the ear axis commutes with this width scaling, so the visor keeps its clearance throughout travel. The motorcycle visor
wraps back to two simple ear hinge circles and sits 3 mm inside
the shell, between the plastic and black foam. It emerges through the face-opening
slot when lowered and hides beneath the shell when raised. The larger ear covers sit in recessed side openings without protruding. Its moving support covers both ear circles and joins them through a
continuous upper visor band. It rotates around the ear axis while retaining its curvature and clearance.
The casing is open underneath and has an inner liner, like a helmet that could be
worn after removing the display. The named `DisplayModule` group contains the
screen only; there is no fixed glass or separate face backing in front of the face. There is no visible propulsion geometry;
`PropulsionSocket` is an empty attachment marker. The geometry and pixel artwork
are generated in code, without downloaded assets. Vader, classic Cylons and the
user-supplied humanoid robot images informed earlier iterations; the final silhouette
returns to the original motorcycle helmet reference.

`src/render/entity/avatar.ts` owns the presentation. The existing player collider
remains the locomotion body. While driving, the avatar uses the same head pose as
the cockpit camera; no visible humanoid is created. Motorcycle mounting will use
the vehicle head pose once motorcycle simulation is implemented. Hovering
oscillates by less than 2 mm, slowly, without changing the collider.

On foot the avatar is smoothed like the cameras (`AvatarFollow` in
`src/render/entity/avatar-motion.ts`): a critically damped follower with velocity
feed-forward for the position and one with turn-rate feed-forward for the heading
(`gameCameraDefaults.avatarFollowResponse` and `avatarYawResponse`, 14 /s). Steady
walking, sprinting and turning have no lag; physics jitter, steps, landings and snappy
heading changes are filtered. Jumps of more than 2 m (getting off a vehicle, teleports,
portals) snap. Only the presentation is smoothed; the collider is unchanged.

A rider thrown off a crashed motorcycle (`Simulation.playerEjection`, see
[motorcycles](motorcycles.md)) is posed by `EjectionTumble`: the helmet tumbles in the air
and rolls along the ground with the slide, squashes when it first hits the ground, lies
where it stopped, then turns upright while it rises back to its hover cushion. A walking
player's head is lowered to the ground meanwhile and comes back up while getting up.

`setMonitorVisorPosition(model, amount)` controls travel from down (0) to up (1).
`setMonitorVisorTint(model, amount)` regulates clear plastic (0) through black
sunglasses (1), with the luminous eyes still visible. SceneView lowers the visor
during daylight and raises it at night. The face blinks and adopts a focused
expression while driving. The display and driver pose remain fixed during visor travel.

## Future human representation

`setMonitorPortrait(model, texture)` accepts a photo texture or `THREE.VideoTexture`
on the same curved surface, bypassing the pixel grid. Passing `null` restores the
blue face. Sunglasses work in either mode. The host supplies the media, configures
its colour space (normally `THREE.SRGBColorSpace`) and framing, and owns the texture
and video lifecycle. There is no camera capture, media upload or network request.
The engine disposes its own matrix texture through `disposeMonitorAvatar`;
normal scene disposal releases meshes and materials.

## Player identity

This robot represents a player. `setMonitorHelmetColor(model, colour)` changes
the shell paint for that instance, keeping the smoked glasses, blue face and trim
independent. The host can expose a colour picker and persist the chosen colour in
its player profile; profile storage and multiplayer replication remain host work.
