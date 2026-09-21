# Elevation test fixture

`terrain.lerc` is the Esri Terrain3D tile at zoom 12, row 1499, column 2027,
retrieved on 2026-09-21 from:
https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/12/1499/2027

© Esri and its data providers. This numeric elevation fixture is used to test the
browser decoder without network traffic; tests deliberately reuse it for each
requested coordinate and do not represent an actual regional terrain mosaic.
Provider attribution and separate elevation terms also apply; see assets/README.md.

## Madrid building regression

`madrid-degenerate-building.json` contains OpenStreetMap way 118189863, retrieved
through Overpass on 2026-09-21 during a real Madrid loading failure. It reproduces
a degenerate generated solid after millimetre rounding. Attribution: © OpenStreetMap
contributors, ODbL; https://www.openstreetmap.org/way/118189863 and
https://www.openstreetmap.org/copyright. Tests pair it with a synthetic valid footprint
to verify that malformed imported geometry cannot reject an entire terrain zone.
