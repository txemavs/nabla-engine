# Entity capabilities and catalogue

`entityCapabilities(entity)` is the public capability API. It derives capabilities
from the current components, so imported scenes require no migration and removing
a component cannot leave a stale flag. Capabilities describe implemented behaviour;
adding a word to a list does not create physics or a renderer.

The current vocabulary is `transform`, `appearance`, `clone`, `solid-edit`, `drive`,
`fly`, `interior`, `dock`, `portal`, `sprite` and `light`. Agency adapters can expose
this list to their entity/pad system; `drive` and `fly` use Agency's existing names.
This change does not migrate Agency or implement its full capability registry.

`entityCatalog` exposes the available presets. `createCatalogEntities(kind, id,
groundPosition)` instantiates one complete bundle with host-supplied unique IDs:

- `car`: original A3 model, suspension, steering and driving configuration.
- `carrier`: flying container, walkable interior, garage and one attached stern portal.
- `streetlight`: nine-metre highway pole with an overhanging luminaire and editable light component.

The supplied position is a ground contact. The factory applies the preset's origin
clearance. In the playground, Scene + places it at the orbit target's X/Z on a
terrain/static-box surface, or Y=0 if none exists. Move/rotate with G/R or property
fields. Cloning a carrier uses the editor's descendant cloning and portal remapping.
Save, export and undo use the existing scene document flow.

The optional `light` component stores `enabled`, `nightOnly`, `color`, `intensity`
(candela) and `distance` (metres). These controls appear in the property inspector.
Night mode follows the existing geographic sky clock; disable night-only for a
scene without a geographic sky. The fixture's pole has a box collider; its arm is
visual geometry. Lamp dimensions follow the pole height, with a fixed-width arm.

Lighting uses six shared spotlights for the closest enabled fixtures within 100 m
of the camera. No lamp casts additional shadow maps. Lens emission remains visible
on other active fixtures. Consequently, local lights can leak through geometry;
this is a deliberate performance limit, not a shadowed interior-lighting system.
