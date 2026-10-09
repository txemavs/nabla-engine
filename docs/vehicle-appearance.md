# Vehicle appearance

The S3/A3 preset defaults to grey (`#888888`); the game chooses a random body colour
when creating a car, unless the host supplies an explicit colour. Its menu also offers silver,
black, red, blue, white, yellow, orange and chrome. Chrome is stored as
`vehicle.paintFinish: "chrome"`, separately from `entity.color`; choosing a normal
colour restores the stock paint properties. Chrome paint parameters are in
`vehicleAppearanceDefaults.chromePaint`.

The game chooses one of six motorcycle colours when creating a motorcycle:
black, white, red, yellow, blue or green. It saves the choice in `entity.color`;
an explicit host colour takes precedence. Rendering never chooses a random colour.

## Investigation and correction

Vehicle interiors and some painted surfaces appeared black while terrain remained
lit, after the chrome experiments. Those experiments added global shader changes
in #170/#172 and later fill/attenuation adjustments. #202 had already removed them
from the tested `9c3db57` baseline; this investigation does not establish a single
commit as the cause of the remaining distance-dependent report.

The remaining presentation had a selective environment for motorcycles, paint
with environment intensity zero and chrome preparation that cleared the environment
map. The common vehicle path now registers every PBR surface and late-loaded part,
preserving authored colours. Shadow toggles also had two stored states and changed
cascade light topology; they now share one tuning state and disable attenuation.

Visual tuning with the user ultimately selected global reflections off, with only
a very small authored minimum on the VFR final silencer. No emission or colour-floor
lighting patches are used. A separate asset issue made wheels, mirror supports and
cockpit plastics share the paintable fairing material. The GLB now separates those
fixed finishes from body paint, retaining the vertex/normal buffers and triangle count.

The correction starts from `9c3db57` and preserves its sound, music and gameplay
changes. The user confirmed the full Euskadi test game looked and sounded correct.
The 8707 instance was left unchanged during this work.
The VFR fairing is marked with GLB `extras.nabla.paint: true`. Only that material
is recoloured; the geometry and other authored materials remain unchanged.

The VFR asset separates fixed finishes from body paint: black mirror supports,
mudguards, plate carrier and rims; dark grey cockpit plastics; grey radiator
faces. `scripts/prepare-vfr800-fixed-finishes.mjs` assigns existing triangles to
these materials and preserves original vertex, normal and image buffers.

The runtime gives every vehicle `MeshStandardMaterial` and `MeshPhysicalMaterial`
the same neutral sky-over-ground environment. This supplies diffuse and specular
indirect light, including to non-metallic cabin surfaces. Body, wheels and later
attachments join the same environment after their presentation adapter runs.
Lighting does not depend on vehicle IDs or material names.

`src/config/vehicle-appearance.ts` owns the stock paint, chrome, wheel and
environment parameters. Its public package entry is
`@nabla/engine/config/vehicle-appearance`. Environment intensity is 0.5, multiplied
by the live **Reflections** light control (default 0, disabled) and a continuous daylight level from
0.15 at night to 1 in daylight. This control affects indirect diffuse lighting as
well as reflections.

The GLB remains the source of base colour, textures and authored PBR properties.
The environment does not brighten base colours or add emission. An optional
GLB `extras.nabla.envIntensity` scales a material's environment response; omitted
values use 1. Correct erroneous asset properties in the asset rather than adding
lighting exceptions in the runtime.

At the user's request, the VFR final silencer is the sole exception to disabled
environment reflections: its separate material has `extras.nabla.envFloor: 0.025`.
The generic environment helper respects this authored minimum. Fork stanchions,
body paint, radiators and all other materials have no minimum and reach zero.

The exported `applyVehicleEnvironment` helper provides the common path for
standalone viewers. `add` registers asynchronously loaded parts and `setLevel`
sets a lighting multiplier. The older selective `applyReflectionEnvironment`
helper remains available for existing consumers; gameplay uses the common path.

Shadow enablement has one owner: `GameRuntime` light tuning, stored under
`nabla.lightTuning`. The game migrates the previous `nabla.shadowsEnabled` choice.
Disabling shadows sets shadow attenuation to zero without removing cascade
lights or changing their shader topology. Quality tiers still own cascade count
and resolution.

Regression tests load the S3, tractor, trailer and VFR material definitions,
verify unchanged authored properties and register late parts. Browser tests
exercise dark dielectric and metallic surfaces through shadow quality changes,
shadow toggles and a distant camera excursion. A procedural environment is a
neutral lighting approximation; it does not capture the surrounding terrain.
