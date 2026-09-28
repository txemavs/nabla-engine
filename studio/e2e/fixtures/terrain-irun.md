# Elevation test fixture

A 62,180-byte Esri Terrain 3D elevation raster, downloaded on 2026-09-23 from
https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/12/1499/2027
for deterministic LERC decoding and relief-only loading tests. Attribution: Esri and its elevation data providers.

Browser tests reuse this one raster for mocked requests; their synthetic surrounding
coverage is not intended to represent the real geography of those neighbouring cells.
