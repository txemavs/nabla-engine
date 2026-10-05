# White truck tractor

Stock four-wheel Engine preset adapted from the tractor in commit `1cca41f`
(`codex/white-truck-studio`). Its original GLBs are under
`assets/library/trucks/white-truck/assets/`.

Uses the existing Engine wheeled simulation, with separate front and rear wheel
models. The shared tyre radius approximates the source's 5 mm front/rear
difference. Driver position and road handling are provisional demo settings.
The demo adds the original trailer model with six passive wheels in the same
Engine world. A `vehicle.tow` reference joins its local anchor to the tractor's
hitch with a yaw hinge limited to ±1.35 radians. It starts attached; interactive
coupling and pitch/roll articulation are not implemented. Recovery resets both
bodies together. No code from `cursor/truck-vehicle-system-e56f` is required.
