# Toro R/C

Adapted from the user-supplied `low_poly_forklift_truck.glb`:
“Low poly Forklift Truck” by [Kolos Studios](https://sketchfab.com/KolosStudios),
[original model](https://sketchfab.com/3d-models/low-poly-forklift-truck-81b895de490646de8c6fb1ba03099e08),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

`node scripts/prepare-forklift-rc.mjs SOURCE.glb` preserves the chassis, cage and
seat, normalizes centimetres/origin/forward, separates the mast and carriage,
and replaces only the original hexagonal tyres/rims with 24-segment wheels.
Three spring-return levers have colored spherical grip knobs. The source
steering wheel remains separate from the levers. The carriage's resting height
is lowered so the tines can enter the existing Engine pallet openings.

The preset uses the existing rear-steering forklift drivetrain, quiet diesel
profile and ForkliftMechanism. `forkliftGeometry` binds the original mechanism
to this model's measured physical forks/backrest. Rendered geometry and physical
colliders share the same mast pivot. The full-detail forklift remains an Euskadi Online asset.
The standalone pallet and its plank collider specification are included here. `pallet-box.glb` adds a 1 m tall box to the existing Engine pallet.
