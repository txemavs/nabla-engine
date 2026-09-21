# Elevation test fixture

`terrain.lerc` is the Esri Terrain3D tile at zoom 12, row 1499, column 2027,
retrieved on 2026-09-21 from:
https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/12/1499/2027

© Esri and its data providers. This numeric elevation fixture is used to test the
browser decoder without network traffic; tests deliberately reuse it for each
requested coordinate and do not represent an actual regional terrain mosaic.
Provider attribution and separate elevation terms also apply; see assets/README.md.
