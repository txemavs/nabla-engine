# S3 low para Quest

El preset normal `car` declara variantes `lowUrl` de carrocería, rueda y volante.
GameRuntime las selecciona en Quest y en calidad mínima, móvil o baja; el original
se mantiene para escritorio con calidad equilibrada o superior.

| Pieza            | Archivo             |  Bytes | Triángulos |
| ---------------- | ------------------- | -----: | ---------: |
| Carrocería       | s3.body-low.glb     | 904300 |      29641 |
| Rueda compartida | s3.wheel-low.glb    |  37064 |       1444 |
| Volante          | s3.steering-low.glb |  33620 |       1356 |

Total de archivos: **974984 bytes** (0,975 MB).
Coche con cuatro ruedas: **36773 triángulos**, frente a 83133 del original.

Se conservan jerarquía, nombres, anclajes, transformaciones y materiales reconocidos
por el equipamiento. Las luces, sus alojamientos, parabrisas, emblemas y parrilla
mantienen su geometría. Pintura y cristal usan materiales PBR sencillos; se conservan
las pequeñas texturas de las luces. La chapa se simplifica teniendo en cuenta las normales y bloqueando los bordes,
sin permitir colapsos a través de discontinuidades. Se conserva más geometría en
los paneles para evitar pliegues en los reflejos. El resto mantiene su reducción.
Los modos Normal/Bestia, física, sonidos, GPS, menú y cuadro siguen siendo los del S3.

Regenerar: `node scripts/prepare-s3-quest.mjs`. El script lee los originales sin
modificarlos y exige menos de 1.000.000 bytes para el conjunto. Los archivos van
separados para permitir que ruedas y volante se articulen y compartan geometría.

Prueba: `/xr.html?example=flat&solo=1&vehicle=car&quality=minimal`.
El rendimiento final debe medirse en el casco.
