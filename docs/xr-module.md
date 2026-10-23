# XR reutilizable y menú Nabla HeadSet

## Contrato compartido

PC, VR y AR usan las entidades, los presets de vehículos, `Simulation` y `SceneView`
del engine. La sesión inmersiva cambia cámara y entrada; no define un coche distinto.
Un ajuste físico de un preset debe hacerse en el catálogo y llegar a las tres vistas
cuando se crea la entidad. Los cambios de configuración no actualizan automáticamente
instancias ya creadas: hay que usar la API correspondiente o recrearlas.

El módulo público `@nabla/engine/xr` agrupa `GameXR`, `XRSessionController`,
`XRGameInput`, `XRCalibration`, `XRGrab` y `XRMotorcycle`. Sus implementaciones
siguen siendo las mismas que usa el runtime; el módulo no crea otro bucle físico.
`@nabla/engine/xr/ui` ofrece los paneles opcionales de calidad y calibración.
AR añade seguimiento de habitación y adaptación de escala: véase
[AR reutilizable](ar-module.md), incluidas sus limitaciones físicas actuales.

## Auditoría de xr.html

El punto de entrada real es `game/xr-entry.ts`, no `game/xr.ts`.
El recorrido es:

```text
xr.html → xr-entry.ts → main.ts → game-page.ts / terrain-main.ts
                                      ↓
                          engine/runtime/browser.GameRuntime
                            ├─ Simulation + SceneView
                            └─ GameXR + controles XR
```

`test.html` y la vista web usan los mismos hosts de conducción y el mismo runtime.
`xr-entry.ts` selecciona escenario y añade `xr=1`; no calcula suspensiones ni monta
ruedas. `xr-demo.html` / `xr.ts` son la antigua prueba de diagnóstico, con interacción
local de ejemplo (`xr-interaction.ts`, `xr-pointer.ts`). No son la ruta de conducción
actual ni la API recomendada para una nueva demo.

| Función                                                                     | Propietario                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Entidades, presets, motor, ruedas, remolque, suspensión                     | Engine: catálogo y simulación                               |
| Montaje visual, ruedas, puntos de agarre y variantes low poly               | Engine: SceneView y presentación de vehículos               |
| Sesión, referencia espacial, cámara, mandos y manos                         | Engine: GameXR y adaptadores XR                             |
| Agarre de volante, manillar, gas y frenos                                   | Engine: XRGrab / XRMotorcycle                               |
| Inventario y calibración simétrica                                          | Engine: XRLoadout / XRCalibration                           |
| Pantalla inmersiva, calidad y calibración                                   | Engine: XRCalibrationScreen y módulo XR/UI                  |
| URL del terreno, celda inicial, flota, textos y navegación                  | Página anfitriona                                           |
| Botón para entrar, modelo de manos elegido, FPS y petición de celda cercana | Composición `game/vr-ui.ts`; llama a APIs del engine        |
| BMW y toro de Euskadi                                                       | Catálogo de la aplicación; no añadir al catálogo del engine |

Los antiguos `game/xr-quality-ui.ts` y `game/xr-calibration-ui.ts` son ahora
reexportaciones de compatibilidad. Su implementación está en `src/runtime/xr/`.
El panel de calidad recibe explícitamente los elementos de desarrollo que el host
quiere agrupar: no busca ni conoce el selector de destinos de esta demo.

## Usarlo desde otra página

En una aplicación que ya ha construido su `GameRuntime`, se reutiliza su sesión:

```ts
import { bindXRCalibration, bindXRQuality } from '@nabla/engine/xr/ui'

// runtime es el GameRuntime ya utilizado para jugar en pantalla.
bindXRCalibration(runtime)
bindXRQuality(runtime, [document.getElementById('xr-calibration')!])
// Dentro del clic del usuario, después de comprobar soporte WebXR:
await runtime.xr.enter()
// La misma entidad sigue en la misma simulación.
await runtime.xr.exit()
```

Los paneles son opcionales y se instalan una vez por página; importarlos no crea DOM.
`bindXRQuality` inicializa la pantalla inmersiva si hace falta. Su comportamiento
por defecto usa el parámetro `quality` de la URL y recarga al aplicar cambios que
necesitan reiniciar la sesión. Una aplicación con navegación propia puede crear su
propia interfaz sobre `runtime.xr.setQuality()` y las APIs del runtime.

Para una composición manual se puede importar `GameXR` desde `@nabla/engine/xr`.
Ese adaptador aporta presentación e input, no sustituye `Simulation` ni `SceneView`.
No instanciar otro `GameXR` si ya se está usando el de `GameRuntime`.

## Entrada de demos: Nabla HeadSet

`/headset.html` es un menú ligero, sin inicializar WebGL, física ni descargar modelos.
Tiene columnas VR y AR (apiladas en pantallas estrechas):

- **Conducir moto / XR / Test**: `/xr.html?xr=1&example=flat&solo=1&vehicle=vfr800&quality=minimal`.
- **Conducir moto / XR / Z15**: mismo vehículo y runtime, con `terrain=/terrain`,
  `tile=16224/11998`, `photo=lo`, `relief=engine`, `time=12:00`.
- **Conducir moto / AR**: `/ar-rc.html?vehicle=vfr&scale=100`, con el vehículo y
  manillar R/C, sin armas, pelotas o mapa.
- Accesos a las pruebas generales VR y a la habitación AR.

El selector Test/Z15 modifica el enlace antes de abrirlo. Z15 requiere que el host
sirva ese terreno; el lanzador no lo descarga anticipadamente. Las rutas y el lugar
Zaisa son configuración de esta demo, no valores universales del engine.
El preset VR es `vfr800`; la calidad de presentación elige el modelo low poly sin
crear otra física para Quest. `solo=1` elimina la flota de demostración, pero el
runtime VR de conducción aún incluye sus servicios generales: no significa una
composición tan mínima como `ar-rc.html`.

## Lo que falta para la equivalencia completa

Esta organización comparte código, pero no demuestra todavía paridad completa
PC/VR/AR ni implementa multijugador. AR mantiene mundos separados para vehículos
y objetos de habitación; falta unificar sus interacciones dinámicas. El origen de
una habitación local también necesita una política explícita para compartirlo.

Las siguientes demos deben reutilizar estas APIs, declarar las mismas reglas de
simulación y medir presupuestos de objetos, terreno, efectos y resolución en Quest.
Los tests de mandos y simulación no sustituyen probar agarres, rendimiento y
colisiones con el casco real. La demo histórica de diagnóstico no debe crecer como
un segundo sistema de gameplay.

## Manipulación compartida

`XRObjectGrab`, exportado por `@nabla/engine/xr`, calcula la pose rígida de objetos
agarrados por una o dos manos y su velocidad de lanzamiento. No cambia la escala
ni sustituye al motor físico. El inventario, marco y adaptadores AR comparten esta
implementación; véase [agarre compartido](ar-module.md#agarre-rígido-compartido-con-una-o-dos-manos)
para unidades, transición entre manos y entrega del movimiento a `Simulation`/`World`.

### Cero de mano y ajuste de pistola

El cero `2026-10-15-hand-zero` incorpora el ajuste de la mano izquierda
`(-2, -1, 0.5 cm; -20, -10, 0°)` sobre el cero anterior; la derecha es su reflejo.
Los campos vuelven a representar desplazamientos desde ese cero. La relación anterior
entre la mano y el mango de la pistola se conserva mediante una transformación rígida,
incluyendo posición y orientación, sin sumar ángulos Euler.

`XRCalibration` guarda V5 y conserva V4 como respaldo. Al migrar, rebasa las manos ya
ajustadas y conserva los ajustes de fundas, bolsillos y puestos de conducción. La migración
se ejecuta una sola vez: recargar no vuelve a incorporar la misma corrección.

En `XRLoadout`, un agarre por el mango sigue el montaje calibrado de la mano durante toda
la sujeción, de modo que editar «Pistola» tiene efecto inmediato. Los agarres libres por
corredera o parte delantera siguen el mando y conservan el punto de contacto. La postura
en funda continúa siendo independiente de la postura en mano.
