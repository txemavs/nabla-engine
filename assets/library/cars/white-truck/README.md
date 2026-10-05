# White truck tractor

Stock four-wheel Engine preset adapted from the tractor in commit `1cca41f`
(`codex/white-truck-studio`). Its original GLBs are under
`assets/library/trucks/white-truck/assets/`.

Uses the existing Engine wheeled simulation, with separate front and rear wheel
models. The shared tyre radius approximates the source's 5 mm front/rear
difference. Driver position and road handling are provisional demo settings.
The demo adds the original trailer as a chassis GLB (`trailer.chassis.glb`:
frame, Stützbein, hitch) plus an optional cargo box (`trailer.box.glb`).
`white-trailer` composes both; `white-trailer-chassis` is the lower trailer
alone. Six passive wheels stay on the chassis. `vehicle.tow` or
`Simulation.hitchTrailer` joins the kingpin to the tractor fifth wheel.
