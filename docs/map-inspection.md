# Desktop map inspection

Press **Home (Inicio)** during play to freeze simulation and inspect terrain with a free camera.
Press Home again to return to the original gameplay camera and resume the unchanged vehicle
pose, velocity and drivetrain state. The return waits for loaded ground and prepared terrain
colliders before physics resumes. No timeout releases a vehicle over unloaded ground.

- WASD or arrows: horizontal movement at 200 m/s, independent of look pitch.
- Shift: 800 m/s.
- Mouse: look; click the canvas to capture the pointer, Escape to release it.
- Q/E or Page Down/Page Up: decrease/increase altitude.

This is a desktop Engine runtime feature, not a separate simulation or a teleport of the
player. XR sessions ignore Home. Inspection uses the existing terrain streamer and render
pipeline; it bypasses gameplay/physics steps and suspends audio and force feedback. Terrain
support correction is paused as well, so an in-flight refined tile cannot lift a frozen car.
The camera begins 30 metres above the current view, angled down for map inspection.
