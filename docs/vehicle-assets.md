# Vehicles and mobile garage

The four original GLBs in `assets/world/` were recovered unchanged from this
repository's experimental branch, commit `6a22576`. See [provenance](../assets/README.md).

## Audi A3 Cabrio

The body is authored in metres with Y up and +Z forward. Its explicit import
rotation is 180° around Y to match the engine's −Z forward. The physics origin is
0.55 m above the model origin.

| Property           | Value                                          |
| ------------------ | ---------------------------------------------- |
| Mass               | 1,400 kg                                       |
| Wheel radius       | 0.315374 m                                     |
| Wheelbase          | 2.58363 m                                      |
| Front track        | 1.524439 m                                     |
| Rear track         | 1.509439 m                                     |
| Steering mount     | Measured column cap anchor; 22.06° inclination |
| Steering animation | At most ±90° around its local axis             |

The wheel model is instanced four times and follows suspension, steering and
rolling snapshots. The original body materials preserve paint, glass, interior
and chrome. The generic entity color does not recolor them. Dimensions/materials
are read-only for these authored models in the playground inspector.

The A3 column's front cap was measured in body coordinates at approximately
(−0.355606, 0.263516, −0.415939), with outward normal (0, 0.375582, 0.926789).
The steering mount sits 8 mm along that normal. A view-only import correction
removes the wheel file's baked 2.8° tilt and offsets its rim centre by −0.0275568 m
in Y before the Z-axis spin. This keeps the wheel concentric throughout its ±90°
travel. Original GLB bytes and the driver camera anchor remain unchanged.
Recognised older preset mounts are updated on load; custom mounts are preserved.

## Carrier

The 5 × 10 m model already faces −Z. Its rear ramp extends along +Z to about 8 m.
The physics origin is 1.2 m above the model origin and its mass is 20,000 kg.
The floor is at model Y=0.295 m. The rear half is the garage; the central bulkhead
has a 1.2 m doorway. Compound colliders preserve that doorway and hollow interior.

The ramp is about 2.915 m long, open at 5.22°. It rotates −95.22° around its declared
hinge when closed. The graphical nodes and physical collider use the same hinge
and angle. The pose switches immediately; a gradual hinge animation is not implemented.
Four hidden suspension rays provide ground driving support.

## Latching and release

Latching requires low relative speed, an empty bay, every chassis corner inside
the declared garage volume and all four wheel rays resting on the carrier.
The car's active suspension is removed and a `LockConstraint` attaches its body
to the carrier. No authored hierarchy or transform is changed.

Release removes the constraint, lowers the ramp and restores the car's suspension.
It requires a stopped carrier in ground mode. Switching controls between the
latched car and carrier is a prototype convenience, without a walking animation.
Oriented-box exit tests let the player dismount inside the hollow garage.

## Assisted flight

`vehicle.flight: true` declares the capability independently of model names.
`toggleFlight()` preserves the bodies and cargo constraints, disables the carrier's
suspension and closes the ramp.

| Input                        | Normal flight behavior                                        |
| ---------------------------- | ------------------------------------------------------------- |
| `lift`                       | Change target altitude at up to 3 m/s; neutral holds altitude |
| `turn`                       | Yaw at up to 1.2 rad/s                                        |
| `forward`, `right`           | Pitch/roll up to 0.35 rad per axis                            |
| `sprint` with altitude input | Accelerated geographic travel                                 |

An attitude controller applies damped torque. Assisted acceleration is distributed
in proportion to the carrier/cargo masses: the net force acts at their combined
centre of mass without forcing the constraint solver to transmit enormous travel
impulses. Vertical feedback holds altitude; horizontal resistance slows drift.
The altitude target has bounded lead to avoid accumulating unreachable commands
against the ground. In geographic scenes, control follows the radial vertical.

Returning to ground mode requires nearby static support, low speed and a level
orientation. Cargo cannot be released in flight, even while hovering. Stop restores
the authored scene; runtime flight/latch state is discarded.

See [controls](controls.md) for keyboard and gamepad mappings. Automated browser
tests use a simulated standard gamepad; physical controller validation remains
separate. Nonstandard radio calibration, acrobatic mode and portals are not included.
