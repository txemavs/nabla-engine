# F14 Tomcat

Source: user-supplied `low_poly_f14_tomcat.glb`.
“Low poly F14 Tomcat” by [SIpriv](https://sketchfab.com/S1Priv),
[Sketchfab source](https://sketchfab.com/3d-models/low-poly-f14-tomcat-e99d03987b574e80971c1c8cc2b75925),
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

6985 source triangles, about 570 kB. Original geometry and textures preserved.
`node scripts/prepare-f14.mjs SOURCE.glb` wraps the scene into Engine metres
(19.1 m long, +Y up, nose toward -Z) and adds aircraft rig metadata.
The ordinary SceneView animates existing wing pivots and the two separate
all-moving horizontal stabilators; two emissive exhaust discs add 32 triangles.
No shadow-casting lights or separate AR flight solver are added.

The shared Engine plane controller uses slow/fast target speeds of 68/140 m/s,
with the fast mode sweeping wings back 48 degrees. This is the existing arcade
flight model, not a dedicated aerodynamic simulation of an F14. Hull and wing
collision boxes use the deployed envelope in both modes.
