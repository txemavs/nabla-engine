# Helicopter visual for the experimental Betaflight drone

Derived from the user-supplied `lbblend.glb`; the supplied file did not declare
its author or license. Preserve that provenance and resolve distribution rights
before redistribution beyond the user's project.

Presentation preparation: fuse body and
mast, align the separately scaled blades, omit the duplicate dense rotor head,
and export two animated pivots (`Main_Rotor`, `Tail_Rotor`). The tail rotor is on
negative X; its blades retain their original YZ plane and rotate around X.
The previous extra 90-degree geometry turn caused the tumbling motion.
`Rotors_Run` animates both pivots. About 14k triangles, 2.8 MB.

ARDrone uses the same BetaflightDrone controller/body/collision/flight tuning as
the previous quad. Only the model changes: scale 0.06, yaw pi to reconcile -Z
model forward with Betaflight's +Z, and skid height aligned to the old body.
Runtime rotors follow motor output. This is a helicopter skin of the existing
quad simulation; no helicopter-specific aerodynamics or mixer was introduced.
