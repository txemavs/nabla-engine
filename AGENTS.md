## Preferencias del HUD de Euskadi Online

- El botón de cámara se llama `CAM`, en mayúsculas, con el icono de ojo. Va dentro del mismo bloque horizontal que FOV y Quality, a su izquierda y alineado en altura; nunca dentro del desplegable FOV.
- El valor del ajuste FOV muestra solo el número: sin «FOV», «ajuste» ni otras etiquetas visibles. Conserva un nombre accesible descriptivo en el control.
- Tras aplicar cambios al juego local, reinicia el servidor de desarrollo para que el usuario pueda probarlos, salvo que pida explícitamente no reiniciarlo. Conserva HTTPS y la configuración de la prueba local.

## Terrain tiles (read before debugging a 403)

- Tiles live at `https://atlas.chained.world/euskadi/terraform`. A cell is
  `z/15/<x>/<y>/z15-<hash>.json` (the cell manifest) plus the files that manifest lists. Always
  include the `z/` prefix; there is no `manifest.json`.
- S3 answers **403 AccessDenied, not 404, for missing objects** because public listing is
  disabled. A 403 on a tile means the cell (or file) does not exist; it is not a permission
  problem. There is no auth, request signing or IP rule to fix.
- `atlas.chained.world` sends no CORS headers, so browsers must fetch tiles through a same-origin
  proxy: `/tiles` via the Vite dev server proxy in development, nginx in production. Build with
  `VITE_NABLA_TILES_URL=/tiles`.
- Example cells that exist: `z/15/16223/11999/`, `z/15/16224/11999/`.
