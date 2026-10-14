# AR como vista del engine

## Objetivo y contrato

Una aplicación PC, VR o AR debe utilizar las mismas entidades, catálogo, `Simulation`, reglas y
`SceneView`. La plataforma adapta la entrada, la cámara y la presentación; no vuelve a implementar
la suspensión, las ruedas, el motor, los frenos o los enganches. El equipo XR añade interacción
con manos sobre esos servicios.

Esta extracción convierte la demo general `game/ar.html` en un consumidor del paquete. No declara
terminado el multijugador PC/VR/AR ni la unificación de todos los mundos físicos.

## Auditoría y extracción realizada

| Responsabilidad                                                 | Antes                                                                | Ahora                                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Sesión AR y actualización de la cámara                          | Código de `game/ar.ts` sobre `GameXR`                                | `GameAR`, en `@nabla/engine/ar`, reutiliza `GameXR`                                 |
| Planos/mallas de habitación, captura y depuración               | `game/ar-room.ts`, mezclado con menú verde                           | `ARRoom` del engine, sin menú, DOM ni contenido de aplicación                       |
| Selección, carga, escala y agarre de vehículos R/C              | `game/ar-rc.ts`                                                      | `ARVehicles`/`ARRC` del engine                                                      |
| Física del vehículo                                             | `XRScaledVehicles` ya llamaba a `Simulation`, pero fijaba reglas AR  | Mismo `Simulation`; las opciones se reciben de la página                            |
| Modelo, ruedas, suspensión visual y articulaciones              | Primero hubo un ensamblador AR; se corrigió antes de esta extracción | Mismo `SceneView` que web/VR                                                        |
| Copia de volante/manillar                                       | URLs y montaje adicionales en la demo                                | Clon de `steeringGrab`/`motorcycleGrab` del presentador ya cargado                  |
| Moto low poly                                                   | Preset físico `vfr800-quest` separado                                | Preset canónico `vfr800`, seleccionando la variante visual low                      |
| Física de habitación y balones                                  | Ya extraída a `xr-room-physics.ts`                                   | Accesible como `ARRoomPhysics`/`ARBalls` del módulo AR; optativa                    |
| Armas, inventario y contactos                                   | Engine, pero antes existieron sondas contra mallas visuales          | Submódulo optativo `@nabla/engine/ar/weapons`; contactos contra `World`/Rapier      |
| GLB/maqueta, proyección y navegación de celdas                  | `game/ar-model.ts`, con servidor y celda incrustados                 | Submódulo optativo `@nabla/engine/ar/models`; servidor/proxy elegidos por la página |
| Menú principal, objetos ofrecidos, URL inicial, HTML de entrada | Demo general                                                         | Siguen en la página: son decisiones de producto                                     |
| Ajustes, pantalla en marco, pizarra/diana, manos                | Ya en módulos XR del engine                                          | Se reutilizan; no se instancian en la demo mínima R/C                               |

Los archivos `game/ar-room.ts`, `game/ar-rc.ts` y `game/ar-balls.ts` son puentes de importación,
no implementaciones alternativas. `game/ar-model.ts` conserva además la URL inicial de Euskadi:
ese destino es de la aplicación, no del engine.

## Entradas públicas y carga optativa

- `@nabla/engine`: `Simulation`, `SceneView`, entidades y servicios comunes.
- `@nabla/engine/xr`: `GameXR`, sesión y entrada inmersiva para el host VR.
- `@nabla/engine/ar`: `GameAR`, `ARRoom`, `ARVehicles`, `XRScaledVehicles`, `ARRCControls`,
  `ARRoomPhysics`. Importar no instancia mundos ni descarga modelos.
- `@nabla/engine/ar/models`: `ARModel`, `miniature`, `atlasModelPaths`.
- `@nabla/engine/ar/weapons`: `XRARWeapons`.

Los submódulos de armas/mapa son optativos. Un import de módulo no equivale a una descarga de GLB;
la carga ocurre al instanciar los componentes que la requieren y llamar a sus métodos de carga.
La distribución de assets sigue el contrato de [asset packs](asset-packs.md).

## Una página que solo carga la moto y su mando

Ejemplo ejecutable: `game/ar-rc.html` + `game/ar-rc-demo.ts`.

- `/ar-rc.html?vehicle=vfr&scale=100`: moto a 1:100 y manillar.
- `/ar-rc.html?vehicle=s3&scale=100`: coche y volante.
- `/ar-rc.html?vehicle=truck&scale=100`: camión, remolque y volante.
- `scale=1`: tamaño real.

Esa página no crea armas, balones, maqueta, pantalla de ajustes ni menú general. Usa las manos
procedurales del runtime. El vehículo se carga tras entrar en AR, cuando hay
pose válida del visor. No se cargan los otros vehículos por ofrecer variantes mediante URL.

La composición esencial es:

```ts
import * as THREE from 'three'
import { GameAR, ARRoom, ARVehicles } from '@nabla/engine/ar'
import { presetVehicle } from '@nabla/engine/vehicles'

// renderer (alpha:true), camera, scene y elementos de página pertenecen al host.
const ar = new GameAR(renderer, camera, scene, onSessionChanged, reportError)
const room = new ARRoom(scene)
const rules = { ignition: false, vehicleDamage: false }
const rc = new ARVehicles(scene, ar.calibration, {
  simulation: rules,
  assetQuality: 'low',
})

// Es la misma entidad que puede pasar a Simulation en la página web/VR.
const bike = presetVehicle('vfr800', 'my-bike')
await rc.load('vfr', 100, camera, [bike])
rc.controls.enabled = true
rc.controls.place(camera)

// En el bucle normal del host, con frame XR válido:
ar.update(frame)
const space = renderer.xr.getReferenceSpace()
if (space) room.update(frame, space, ar.visible)
rc.update(dt, ar.visible ? ar.grabHands : [], room.targets)
renderer.render(scene, camera)
```

`ar.enterAR(navigator.xr)` debe llamarse desde un gesto de usuario. El ejemplo completo maneja
compatibilidad, entrada, salida, tamaño de ventana y limpieza. No espera una carga de modelo antes
de solicitar la sesión, para no perder la activación de usuario.

`rc.simulation` y `rc.presentation` son las instancias reales de `Simulation` y `SceneView`, no
copias de sus APIs. `load` acepta entidades ya configuradas y conserva sus parámetros, relaciones
y posiciones relativas al colocar el conjunto. Los perfiles de mando actuales son moto, coche y
camión; todavía no constituyen un registro universal de mandos para cualquier entidad.

## Dónde cambiar cada cosa

- Masa, suspensión, motor, geometría física, enganches: definición/catálogo del vehículo y
  simuladores compartidos del engine. No crear valores alternativos en la página AR.
- Variante low poly: datos visuales y `assetQuality`, sin copiar la configuración física.
- Reglas de juego: las mismas opciones de `Simulation` para todos los participantes. La demo
  R/C desactiva encendido y daños explícitamente; son reglas de esa demo, no del modo AR.
- Agarre, calibración y conversión de mandos a entrada: módulos de interacción del engine.
- Objetos disponibles, servidor de mapa y navegación del menú: host de cada aplicación.

Un cambio de preset se refleja al construir nuevas entidades con la misma versión del catálogo.
No hay propagación automática de ediciones a entidades ya instanciadas ni actualización remota de
sesiones abiertas. Para comprobar parámetros nuevos hay que reconstruir/recargar el paquete y la
escena o usar las APIs explícitas de actualización del engine.

## Escala: presentación y frontera de coordenadas

`XRScaledVehicles` simula en metros nativos y aplica la escala al pasar al espacio de habitación.
Los colliders escaneados se convierten a metros nativos para esa simulación. Velocidad, masas,
constantes de suspensión y tiempo no se multiplican por la escala visual. A 1:100 el desplazamiento
visible es cien veces menor; a 1:1 corresponde al desplazamiento nativo.

Las pruebas comparan trayectorias a 1:100, 1:8 y 1:1, y comprueban el enganche real del camión.
Las ruedas se posicionan por `SceneView`, no por una interpretación AR de los anclajes GLB.

## Límites actuales: lo que aún no se debe prometer

1. **Un único mundo físico para todos los objetos.** Los vehículos escalados poseen una
   `Simulation`; balones/cargadores usan el mundo de habitación del engine. Comparten Rapier y
   servicios, pero todavía no hay colisión dinámica mutua entre ambos mundos. No basta con mover
   archivos para resolverlo. Hay que definir una escena/autoridad y una frontera de escala común.
2. **Objetos sujetos.** El tracking dirige las manos; las consultas de volumen de Rapier limitan
   objetos sujetos contra colliders. No es todavía un sistema universal de manos rígidas con
   articulaciones y fuerzas bidireccionales. Los cargadores sueltos sí son cuerpos dinámicos.
3. **Maqueta cartográfica.** Reutiliza proyección y materiales, pero su navegación de celdas sigue
   siendo un adaptador del formato de manifiestos Z15; aún no es el mismo streaming completo del
   mundo de conducción. El transporte URL es inyectable y no fija un servidor de Euskadi.
4. **VR y AR no implican red.** Esta demo no sincroniza jugadores ni publica un estado autoritativo.
   El siguiente paso multiplataforma exige IDs compartidos, las mismas reglas, entradas normalizadas,
   autoridad física, snapshots/interpolación y una transformación AR local por participante.
5. **La habitación es local.** Sus superficies no deben alterar de forma unilateral una partida
   compartida. Debe decidirse qué geometría forma parte del mundo autoritativo y qué es colocación u
   oclusión local. El tamaño de maqueta tampoco puede cambiar la física remota de otro jugador.

## Orden para continuar sin bifurcar el engine

1. Mantener una prueba de la demo mínima sin cargas de contenido opcional y regresiones de la demo general.
2. Extraer la composición de escena compartida y el registro de objetos físicos: un propietario por
   mundo, entidades identificables y reglas de juego explícitas; integrar props y vehículos.
3. Hacer que PC, VR y AR produzcan la misma entrada de juego y consuman el mismo estado de escena.
4. Incorporar autoridad/sincronización de red a ese contrato; no añadir una física distinta por visor.
5. Medir presupuestos reales en Quest (frame time, colliders, draw calls y resolución) por composición.

Cada paso debe comprobar equivalencia física y visual. La prueba de aceptación final será la misma
escena y versiones de reglas, ejecutada por PC/VR/AR, con resultados físicos compartidos; no tres
implementaciones que simplemente se parezcan.

## Entrada común VR/AR

El [módulo XR y menú Nabla HeadSet](xr-module.md) documenta la ruta compartida de
conducción web/VR y el acceso a las demos desde `/headset.html`.

## HUD y expulsión de munición

`GameXR.interactCalibration()` procesa también los botones que siguen la cabeza:
toque con índice o punta del arma; rayo y gatillo con mano libre. La entrada capturada
no dispara el arma. Los botones dan feedback de profundidad, clic y vibración si hay
actuador disponible. Las composiciones mínimas deben llamar este método aunque no
instalen la pantalla de calibración.

`XRARWeapons` reutiliza `CasingMotion`, `Casings`, `DroppedMagazines` y `ShotTracers`:
casquillos al disparar, cartucho vivo al extraerlo de la recámara y trazas breves.
La caída consulta el `World` del engine entregado en `physicsWorld`, con la geometría
de habitación. `casingLimit=0` oculta tanto casquillos como cartuchos expulsados.
Las trazas son feedback visual; no introducen una segunda simulación de proyectiles.

El botón de salida del HUD requiere mantener el toque o el gatillo durante 800 ms;
soltar o apartar el rayo cancela la pulsación. La mano libre con agarre pulsado no
activa el HUD mientras manipula una corredera o cargador. X del mando oculta y
muestra el monitor conservando su pose en la sesión; el acceso de ajustes del HUD
lo trae de nuevo delante (`show(true)`). Al cambiar de sesión se vuelve a colocar.

## Malla y planos del escaneo

`ARRoom` ya no superpone planos simplificados a la malla: `source='auto'` usa
mallas con pose válida cuando existen y recurre a planos sólo si no hay malla seguida.
`setSource('mesh')` excluye siempre los planos; `setSource('planes')` permite comparar.
`surfaceCounts` informa de mallas, planos seguidos y superficies activas. El selector
«Geometría» de la demo cambia la misma lista `targets` para disparos, suelo y física;
los consumidores eliminan los colliders desactivados en su siguiente actualización.
Esto permite aislar planos erróneos, no repara una malla mal escaneada ni borra datos
persistentes del casco. Atravesar una superficie no invalida el escaneo.

En «Ver superficies», cada superficie tiene un color estable mientras conserve su
identidad de seguimiento: planos en tonos cálidos, mallas en tonos fríos. Los colores
representan superficies WebXR, no objetos reconocidos; una malla de habitación puede
contener varios muebles. Actualizar su geometría mantiene color y material; al perder
la superficie se libera también su material.

## AR con referencia unbounded

Las sesiones `immersive-ar` de `XRSessionController` requieren ahora `unbounded` y
`local-floor`. El renderer y todas las consultas de cámara, mandos y habitación usan
un **offset de unbounded**; `local-floor` sólo aporta la altura inicial del suelo.
Se espera a tener ambas poses antes de habilitar interacción AR. Así no se supone
que el origen unbounded sea el suelo ni se introduce una altura de usuario inventada.
Al salir y volver a VR, el renderer vuelve a `local-floor`.

Si no se admite unbounded, se informa del error; no se abre automáticamente otra
sesión con el modo antiguo. El modo de referencia no desactiva por la fuerza las
protecciones del sistema: los avisos finales dependen de Quest Browser/Horizon OS y
se deben verificar en el casco. Meta muestra unbounded para experiencias de mayor
extensión en su [ejemplo RealMeasure](https://developers.meta.com/vr/documentation/web/web-sample-realmeasure/).

Los coches R/C siguen utilizando `ARRoom.targets` mediante `XRScaledVehicles`: el
cambio de referencia espacial no crea otra física ni cambia la escala de sus reglas.

## Puestos R/C y sonido

El volante del S3/camión envía aceleración positiva con el gatillo derecho y orden
negativa con el izquierdo mientras se agarra: el drivetrain del engine decide frenar
y pasar a marcha atrás. La moto conserva gas de muñeca y frenos delantero/trasero.

Los puestos siguen el torso con `XRBodyAnchor`, la misma estimación estable que el
chaleco. La combinación de dos gatillos ya no fija el puesto. Debajo del volante o
manillar hay una base que se puede agarrar y un botón negro: tocarlo con el índice,
o pulsar el gatillo junto a él mientras se agarra la base, alterna fijación al mundo
y seguimiento del pecho. El soporte se ilumina al fijarse; se conservan los ajustes
independientes de cada puesto.

`ARVehicles.unlockAudio()` se llama desde el clic de entrada y `setAudioActive()`
sigue la visibilidad de la sesión. Se reutiliza `VehicleEffects.updateAudio`, con
`worldScale` para colocar emisores en la posición de la miniatura. RPM, carga, perfil
sonoro y cambios de marcha siguen siendo los del vehículo real; no se escala el tono.

### Agarre rígido y error de audio no finito (2026-10-14)

Se reprodujo una divergencia al mantener agarrado y girar un vehículo. El adaptador
calculaba `delta = destino * inversa(anterior)` y después `delta * anterior`, pero
`Quaternion.invert()` de Three sólo conjuga: presupone una rotación de norma uno.
El pequeño error de redondeo de la rotación anterior se elevaba al cuadrado en cada
fotograma, sin pasos físicos que lo normalizaran mientras estaba agarrado. En la
reproducción, la norma llegó a aproximadamente `7.8e31` al fotograma 60 y a valores
no finitos poco después. La posición terminó contaminada y el cálculo de distancia
del emisor lanzó `AudioParam.setTargetAtTime: provided float value is non-finite`.

`XRScaledVehicles.moveAssembly` aplica directamente la pose normalizada al cuerpo
agarrado; para sus cuerpos unidos normaliza la inversa, el delta y el resultado.
`Simulation.relocateVehicles` valida el conjunto antes de tocar ningún cuerpo,
normaliza sus rotaciones y actualiza las poses anteriores para que la interpolación
no arrastre la posición previa al agarre. Las pruebas mantienen y giran el coche
y el conjunto camión/remolque durante 2.000 actualizaciones y comprueban rigidez,
enganche, pose finita y continuación de la física al soltar.

Se retiró el apagado provisional permanente del audio y el descarte silencioso de
coordenadas. Esta reparación actúa sobre la transformación que causaba el problema;
no cambia el timbre, turbo, síntesis ni mezcla del sonido.

### Agarre rígido compartido con una o dos manos

`XRObjectGrab` está exportado por `@nabla/engine/xr`, `@nabla/engine/ar` y runtime.
Conserva el punto de contacto de la mano y la escala del objeto. Con dos manos usa
su punto medio y el eje entre ellas, con orientación de muñecas y continuidad cuando
las manos quedan demasiado juntas. Cambiar de una a dos manos, soltar cualquiera o
transferir el agarre recalcula sólo la referencia, sin recolocar el objeto.

`update(object, grips, dt)` devuelve `true` al soltar la última mano. `velocity`
(m/s de la habitación) y `angularVelocity` (rad/s) se calculan sobre los últimos
80 ms, incluida la pose del mando en el fotograma de liberación. Un intervalo de
tracking superior a 100 ms reinicia esa estimación. El adaptador no simula gravedad
ni colisiones: entrega el movimiento a la física existente.

Lo usan las miniaturas R/C, pelotas, cargadores sueltos, el marco y la base del puesto
de conducción. El apoyo y traspaso de pistola comparten el cálculo de pose; soltarla
mantiene su comportamiento de retorno a la funda. Marco y puesto permanecen sujetos
a sus reglas de colocación, no se convierten en objetos arrojadizos.

`Simulation.releaseVehicles` reanuda los cuerpos con la velocidad proporcionada.
`XRScaledVehicles.releaseAssembly` convierte m/s de habitación a unidades nativas,
conserva rad/s y aplica `v + ω × offset` a cada cuerpo unido, incluido el remolque.
Pelotas y cargadores reciben ambas velocidades en sus cuerpos de Rapier existentes.

### Láser e impactos compartidos

El índice libre de la otra mano conmuta `Sidearm.toggleLaser()` al tocar la punta
(3 cm; exige separarse 5,5 cm antes del siguiente toque). La detección está en
`XRLoadout` y se comparte con VR. Ambas pistolas dibujan `ShotLaser` desde su
`RedLaserSocket`, recortado por la primera superficie; el láser no provoca impactos.
AR deja de añadir `ShotTracers` a cada disparo. Conserva `ShotSparks` e `ImpactMarks`
para las chispas y el agujero negro, con sus límites de calidad y tratamiento de
superficies originales. Los demás usos de trazadoras del engine no se modifican.

### Cero del volante y monitor único

Los puestos R/C del S3 y camión incorporan un giro Y de 180° en su pose base.
La calibración V4 convierte las rotaciones guardadas del volante al nuevo marco,
conservando posición y ajustes de otros objetos; las copias V3 siguen disponibles.
La dirección y la animación del volante usan el sentido del nuevo eje local.
El manillar conserva su calibración y comportamiento.

GameXR ya no crea la barra de botones ni el contador flotante unido a la cabeza.
El monitor mantiene los controles y se abre/cierra con X. `onStats` sigue
entregando estadísticas al anfitrión sin crear geometría ni textura HUD.

## Estado de entrega y pendientes (15 de octubre de 2026)

La demo general y las demos mínimas consumen módulos reutilizables del engine.
Se incluyen los últimos cambios compartidos de XR/AR: agarre y lanzamiento con una
o dos manos, calibración V4 del volante, monitor como interfaz, láser táctil e
impactos originales, audio y vehículos a escala con Simulation/SceneView.
El soporte genérico de mecanismos hidráulicos y sus entradas puede ser utilizado
por aplicaciones; el modelo/preset BMW y el toro/palets de euskadi.online no se publican aquí.

Incidencia pendiente reportada en Quest: el suelo y los planos de habitación pueden
aparecer desplazados hacia abajo y girados. Falta reproducir y revisar el ciclo de
recentrado/cambio de referencia; este PR no afirma haber corregido esa desalineación.
La detección de planos/mallas depende de los datos que entrega el casco.

Queda medir y optimizar carga de mapa, geometría, efectos y entidades simultáneas
para mantener el objetivo inicial de 30 FPS de aplicación. La validación automática
no sustituye estas mediciones en Quest ni garantiza ese rendimiento.
