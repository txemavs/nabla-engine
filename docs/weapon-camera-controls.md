# Cámara, pistola y preparación de efectos

Estado revisado: 14 de octubre de 2026. Estos comportamientos pertenecen a Engine
y se aplican también al juego de Euskadi Online al actualizar su `ENGINE_REF`.

## Controles del jugador

| Contexto                                | Control     | Resultado                                                                                                 |
| --------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| Cámara                                  | V           | Cambiar vista; sustituye a C.                                                                             |
| A pie                                   | C           | Agacharse.                                                                                                |
| A pie                                   | C + Espacio | Cuerpo a tierra.                                                                                          |
| Nave compatible                         | C           | Alternar vuelo; sustituye a V.                                                                            |
| A pie, apuntando                        | Q / E       | Asomarse a izquierda / derecha, con inclinación y límite por obstáculos.                                  |
| Pistola en primera persona, sin apuntar | Rueda       | 12 posiciones laterales: delante hacia diestro, atrás hacia zurdo. No refleja la geometría ni sus textos. |
| Pistola en primera persona, apuntando   | Rueda       | Delante acerca al ojo; atrás extiende el brazo.                                                           |
| Pistola                                 | Z / X       | Inspección / recámara. F opera la corredera; R el cargador.                                               |

La rueda conserva sus funciones de cámara en vistas exteriores/mapa y vehículos.
Con menús o sin control del juego no modifica las preferencias del arma.

## Distancia, miras y corredera

`src/runtime/weapon-wheel.ts` mantiene dos preferencias independientes:
`hand` entre 0 y 11 y `distance` entre 0 y 1. La distancia avanza en incrementos
de 0,05; equivale a una extensión adicional máxima de 0,30 m. Ambas se suavizan
en la presentación. Los valores iniciales son diestro y distancia cercana.

El desplazamiento se aplica después de la alineación, siguiendo el eje del arma
ya calibrada. No desplaza solamente en Z de cámara ni recalcula la orientación
desde la nueva distancia: eso cambiaba la línea de miras. Al apuntar desaparece
el desplazamiento lateral de mano y se vuelve a la línea de tiro.

La extensión adicional se multiplica por `1 - slidePoseBlend`: durante la postura
de corredera se usa exclusivamente la extensión de esa animación. Al acabar se
recupera suavemente la distancia elegida. Las combinaciones F+Z/F+X comparten esta
transición. El ajuste guardado no se borra ni se suma a la calibración de poses.

Con el efecto túnel habilitado en bodycam, su intensidad baja de 100% cerca del
ojo a 25% con brazo extendido, multiplicada por la transición de apuntado.

## Preferencias y valores de fábrica

| Clave localStorage        | Responsabilidad                                                |
| ------------------------- | -------------------------------------------------------------- |
| `nabla.weaponWheel`       | Mano y distancia del jugador; independiente de la calibración. |
| `nabla.weaponPoses`       | Poses normal, apuntado, inspección, recámara y corredera.      |
| `nabla.sidearmTuning`     | Altura y ángulo de calibración del apuntado.                   |
| `nabla.muzzleFlash`       | Posición e intensidad del fogonazo.                            |
| `nabla.actionCamSettings` | Parámetros de la cámara al caminar.                            |

Opciones → Pistola · fogonazo permite cambiar X/Y/Z en milímetros (±200) e
intensidad (0–300%). Valor de fábrica: X=0, Y=0, Z=-72, intensidad=100%. En el
sistema local del arma, Z negativo significa hacia delante. El botón de prueba
ilumina durante un segundo sin gastar munición. Se usan focos dirigidos hacia
delante, sin sombras dinámicas adicionales, para evitar iluminar la trasera.

Los valores de recámara de fábrica, en grados y milímetros, son:

| Pose        | Pitch | Yaw   | Roll | X    | Y    | Z     |
| ----------- | ----- | ----- | ---- | ---- | ---- | ----- |
| X           | 9     | -16,1 | 14,7 | -0,1 | 64,7 | 0,3   |
| X apuntando | 7,3   | -6,1  | 27,9 | 0    | 19,5 | -90,1 |

Se definen en `src/config/gameplay-tuning.ts`, junto al perfil suave de Action Cam.
Los ajustes existentes del navegador prevalecen sobre estos valores; AJUSTES
PREDETERMINADOS elimina también las claves anteriores. Las preferencias de
localhost no se transfieren automáticamente al dominio euskadi.online.

## Modelo y efectos

El GLB distribuido es `assets/library/weapons/hk-compact/hk-compact.glb`:
cachas y zona superior del mango reparadas, trasera simplificada, biseles suaves,
recámara revisada y círculo trasero negro mate. Conserva las piezas de la rig
para corredera, cargador, gatillo y martillo. El cargador se ancla por su parte
superior para no sobresalir por arriba. El puerto de expulsión sigue
`ChamberExterior`; las vainas y cartuchos usan ese origen. Los impactos sobre
camiones y remolques se anclan a la superficie visual y acompañan al vehículo.

La preparación inicial crea las reservas de casquillos, cartuchos y cargadores;
prepara fogonazo, láser, humo, impactos y vistas primera persona/exterior/mapa.
Los materiales se compilan con las luces y mapas de sombras reales, incluida
la luz del fogonazo desde antes del primer disparo. También se prepara la ruta
de enfoque/túnel y el humo en tercera persona. Los dibujos de precarga restauran
el destino de render, visibilidad y flags de sombras; no simulan disparos.
Véase [presentation-preload.md](presentation-preload.md).

## Verificación

- `npm run build` y pruebas `test/runtime/weapon-wheel.test.ts`,
  `test/runtime/presentation-warmup.test.ts`, `test/game/reset-settings.test.ts`.
- En una sesión nueva: recorrer 12 posiciones, apuntar y recorrer la distancia;
  comprobar que la calibración no cambia y que las preferencias sobreviven a recarga.
- Con máxima distancia, operar F apuntando: no sumar otra extensión a la postura
  de corredera. Al terminar debe volver la distancia de rueda.
- Comparar orientación y desplazamiento cerca/lejos: orientación constante y
  desplazamiento paralelo al eje del arma, sin desviación transversal.
- Revisar primer disparo, Z/X, recarga y ciclo V con `renderer.info.programs`:
  en la prueba local el contador permaneció en 238 y no hubo errores JS. Es una
  comprobación de variantes de shaders, no una garantía de FPS en todo hardware.

El escenario `/test.html` usa suelo local, vehículos separados y arma equipada,
sin cargar GLB de terreno. La ruta `/` de Euskadi mantiene su escenario geográfico.
