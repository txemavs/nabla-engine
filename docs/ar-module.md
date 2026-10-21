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
procedurales del runtime y el botón de salir. El vehículo se carga tras entrar en AR, cuando hay
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

## AR reference spaces (Quest and Android)

`immersive-ar` sessions in `XRSessionController` now only require `local`. `unbounded`,
`local-floor`, `hit-test`, `plane-detection`, `mesh-detection` and `anchors` are optional, so
Chrome on ARCore Android phones accepts the session (ARCore does not offer `unbounded`).

- **Quest:** Quest Browser grants `unbounded`; behaviour is unchanged. The renderer and every
  camera, controller and room query use an **unbounded offset**; `local-floor` only supplies the
  initial floor height, and interaction waits for both poses.
- **Android (ARCore):** without `unbounded` the session renders in `local-floor`. If the runtime
  also refuses `local-floor`, it falls back to `local` (origin at the device's start pose, no
  floor height); use hit-test to find real surfaces. The fallback is recorded as the
  `unbounded-unavailable` diagnostic, and `referenceSpaceType` reports the active space.
- **VR** still requires `local-floor`; there is no fallback in VR.

Back on VR after AR, the renderer returns to `local-floor`.

## Hit-test and placement (`XRHitTest`)

`XRHitTest` (exported from `@nabla/engine/ar` and `@nabla/engine/xr`) wraps a WebXR hit-test
source cast from the `viewer` space (the screen centre on a phone, the gaze on a headset). It
owns no geometry or materials:

```ts
const ar = new GameAR(renderer, camera, scene, onSessionChanged, reportError)
ar.hitTest.reticle = myReticle // any Object3D supplied by the host; shown only on a hit
// On a tap / select:
if (ar.hitTest.place(myObject)) {
  /* myObject now sits on the surface */
}
```

`GameAR` starts the source on its session and updates it every frame with the frame's render
space (`referenceSpace`), so hits share the coordinates of cameras and room queries. `hit`
returns the latest pose (reused object; copy to keep it), `supported` is true once the source
exists, and `unavailable` is true when the session did not grant `hit-test`. Hosts own the
reticle appearance and placement rules; the engine adds no scene content.

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

### Cambios de origen al volver de grabar

Los eventos WebXR `reset` ya no solicitan un centrado basado en la cabeza. El
runtime conserva el mundo aplicando `inverse(reset.transform) * originOffset`:
la transformación del evento describe el origen nuevo en las coordenadas antiguas
([contrato WebXR](https://immersive-web.github.io/webxr/#xrreferencespaceevent-interface)).
En AR solo se compensa el `reset` de unbounded; local-floor aporta la altura inicial,
pero su propio reset no debe recentrar otra vez el mundo. Pausar para abrir la cámara
no recalcula el cero. El centrado inicial espera una sesión visible.

Se cubren con pruebas traslaciones, altura, rotaciones, avisos duplicados entre
referencias, interrupciones y limpieza al salir. Falta confirmar el ciclo de grabación
en Quest. Si el navegador entrega un reset sin transformación, se informa de la
limitación; no se inventa una corrección usando la posición actual de la cabeza.

### Opciones de visualización de manos

El último botón del menú principal abre **Opciones**. **Mostrar manos: Sí/No**
guarda la preferencia en los ajustes XR y oculta solo los modelos visuales.
El seguimiento, la pose del índice para tocar el monitor y los agarres siguen
actualizándose; pistolas y demás objetos permanecen visibles. En AR permite ver
las manos reales a través del passthrough. La opción se puede volver a activar
con el rayo o tocando el mismo monitor.

El mismo menú **Opciones** ofrece **Mapa 1:100**, **Mapa 1:500** y **Mapa 1:1000**.
La demo guarda la selección y usa `ARModel.setScale(denominator)` para aplicarla
antes o después de cargar la maqueta, sin descargar otra vez sus celdas. La raíz
mantiene su posición en el suelo y la navegación conserva pasos de 100 metros de
mapa, convertidos a la escala seleccionada. La escala R/C es independiente.

### Radiocontrol y papelera trasera del monitor

La demo agrupa S3 bestia, VFR, camión con remolque y el BMW local en la pantalla
**Radiocontrol**, junto a escala y control real. El BMW sigue siendo contenido de
aplicación; no se añade a los presets de ARVehicles. El S3 utiliza `Simulation.setEngineMode`
y la pintura usa `SceneView.setVehiclePaint`, con un color aleatorio al cargar.
B del mando derecho se convierte en la entrada `brake` (freno de mano) de Simulation;
los frenos de servicio mantienen sus entradas analógicas independientes.

El monitor aporta un sólido a los mundos físicos existentes. Por delante los objetos
colisionan; por detrás `XRDisposalPortal` consulta un barrido de esfera contra caja de
Rapier antes del paso de física. Es un disparador direccional finito, no otro integrador.
ARBalls retira el cuerpo y su malla; ARVehicles llama a su limpieza de conjunto (tractor,
remolque, controles, marcas y emisores). Los cargadores sueltos usan su cuerpo de engine
y la misma prueba; el inventario retira el objeto y XRItemContacts libera el cuerpo.
Al ocultar el monitor se desactivan tanto el sólido como la papelera. Las colisiones
suplementarias no desactivan el suelo de respaldo mientras falta el escaneo de habitación.

El emblema del S3 se corrige en ambos GLB de volante mediante
`scripts/fix-s3-steering-badge.mjs`, conservando el triángulo original y colocándolo
frente al conductor, centrado en el núcleo y cromado como los emblemas exteriores. PC, VR y AR cargan los mismos assets.

### Seguimiento de manos experimental

`GameXR` ofrece en Opciones «Manos sin mandos (experimental)», desactivado por defecto y persistido con la calidad. Tras activarlo hay que salir y volver a entrar: `XRSessionController` solicita entonces la característica opcional WebXR `hand-tracking`. Los mandos siguen disponibles si el dispositivo no proporciona manos.

`XRTrackedHand` convierte articulaciones nativas en el mismo contrato `GrabHand` y squeeze que consume el inventario de engine. Abrir la mano habilita el agarre; cerrar medio, anular y meñique lo mantiene y abrirlos lo libera. Una pérdida de seguimiento libera el gesto y exige volver a abrir. No sintetiza disparos. El índice real permite tocar el monitor; la pinza izquierda pulgar/índice con palma abierta alterna el menú. No dibuja guantes sobre las manos naturales. Es una primera prueba de coger y soltar, pendiente de calibración física en Quest; disparo y recarga gestuales quedan pendientes.

En AR, `XRLoadout.physicalPistols` mantiene la pistola en el mundo al soltarla fuera de su funda. El mismo `XRObjectGrab` proporciona velocidad lineal y angular; `XRItemContacts` crea su cuerpo en el mundo de engine. Recogerla elimina el cuerpo y soltarla a menos de 16 cm de su funda la enfunda. El comportamiento de las demos VR no cambia. Los cargadores y pistolas sueltos participan en la consulta de disparos: el impacto aplica un impulso con torque al cuerpo existente, sin añadir marcas sobre el objeto.

La interacción compartida de `XRLoadout` permite recoger por la corredera conservando el punto de agarre, y usar la segunda mano junto a la empuñadura como apoyo (reducción de retroceso existente). Si otra mano sostiene el arma, agarrar la corredera inicia su recorrido desde el punto tocado. El índice libre acciona `SafetyLeverPivot` y `SlideReleasePivot` con histéresis de contacto; usa `Sidearm.setSafety` y `handleMagazine('release')`, y solo libera una corredera ya bloqueada. No introduce otra simulación del arma.

B (derecha) o Y (izquierda), botón WebXR 5 de la mano que sostiene el arma, extrae el cargador real mediante `takeMagazine` una vez por pulsación. Conserva su contenido y cae con el movimiento del arma. En AR, los objetos sostenidos tienen cuerpos cinemáticos en el mismo mundo Rapier que el inventario suelto; al soltarlos vuelven a dinámicos. Las consultas de contacto excluyen el cuerpo propio. Los cargadores pueden caer y descansar sobre un arma sostenida, con restitución moderada para los rebotes.

### Maqueta de la frontera / Zaisa

La demo AR usa como centro `15/16223/11997`, correspondiente al arranque publicado por Euskadi Online (43.342291, -1.759511). `ARModel.loadNeighborhood()` solicita secuencialmente sus ocho vecinas y conserva como máximo nueve celdas. El recuento visible informa de cargas incompletas. A 15 de octubre de 2026 Atlas responde 403 para `16224/11996`; las otras ocho celdas publican versión 4.

El cargador de maquetas pasa el paquete por `validateAtlasZ15Package` y `adaptAtlasManifest`, igual que engine: usa `terrain.lidar` unificado en versiones modernas, asfalto publicado y soportes de puentes, además de edificios y proyección de techos. Ya no oculta la capa de carreteras. La celda central se comprobó en navegador: 7 mallas visibles, 5 con textura, 1.264.871 triángulos. No implica validación del rendimiento de nueve celdas en Quest.

Actualización de la prueba: centro desplazado a `16223/11998`, con filas 11997–11999 y columnas 16222–16224. Las nueve publican v4 y la zona incluye el arranque de Euskadi Online. La maqueta y el R/C pueden coexistir. `ARModel.collisionSurfaces` expone mallas sólidas visibles sin drapes fotográficos ni faldones; se pasan al contrato de superficies de `ARRC`/`XRScaledVehicles`, que transforma ambas escalas a metros nativos antes de la simulación. Opciones permite Auto (habitación + mapa), Malla habitación, Planos habitación o Solo mapa. Los modos y escalas de presentación no sustituyen la física de vehículos.

La carga 3×3 es una prueba de capacidad. El objetivo de conducción continua es mantener cuatro celdas residentes y precargar según posición/dirección, midiendo también memoria transitoria, decodificación, subida a GPU y creación de colisiones; este objetivo no se considera validado por cargar nueve celdas en escritorio.

La prueba se limita ahora a cuatro celdas (2×2). `loadNeighborhood` serializa peticiones concurrentes y libera las celdas que salen de la ventana antes de decodificar las siguientes; también puede retirar la celda inicial, manteniendo el origen y la cota vertical comunes. La ventana sigue el desplazamiento de la maqueta con la seta. No se ha implementado aún seguimiento predictivo del vehículo ni recorte por el contorno del suelo de la habitación; recortar visualmente no elimina por sí solo geometría ni colisiones.

El agarre de pistola distingue mango (`handle`) de agarre libre (`free`). Solo el mango se alinea con el montaje calibrado y permite disparar. La mano auxiliar estabiliza el retroceso sin modificar la postura del mango. Al soltar la mano principal, una mano que sujeta delante o la corredera recibe la pistola conservando su pose; al coger de nuevo el mango se recalibra la pose y la anterior mano pasa a apoyo. El mismo flujo permite recoger por el mango una pistola en caída.

### Four visible quarters, four resident Z15 cells

`splitMapQuarters` partitions static Atlas geometry along the two cell midlines. It clips crossing triangles and interpolates their vertex attributes (including UVs), preserves material groups and compacts each quarter's vertices. This is real geometry partitioning, not shader-only clipping. Missing normals are generated. Work yields periodically while preparing a cell.

`ARModel` activates a 2×2 quarter window: its area equals one Z15, potentially assembled from four different cells. Only visible quarters enter `collisionSurfaces`. Up to four full Z15 cells remain resident; the spare cells are selected towards travel, loaded serially and evicted before replacement. This is a bounded directional cache, not an additional full ring beyond the four-cell budget. The demo follows the R/C vehicle and supports manual map translation. Textures are still shared at whole-cell resolution; decoded geometry/texture memory and the cost of preparing the next cell remain limitations to measure on Quest.

Validation: nine tests cover partition area, UV continuity, missing normals, selection and eviction. The live Atlas start cell loaded in Chrome after partition: 1,270,505 triangles versus 1,264,871 before partition (about 0.45% seam overhead when all its quarters are shown). This does not establish Quest FPS or prove that four decoded cells fit the headset's memory budget.

### Agarre de funda y cartuchos manipulables

`XRLoadout` siempre extrae la pistola de la funda al montaje calibrado del mango.
En una pistola suelta se conserva el agarre libre de corredera/punta; cerca del
`GripSocket` tiene prioridad el agarre alineado.

Los cartuchos vivos pertenecen a `XRLoadout.cartridges`: se pueden recoger tras
expulsarlos o coger la bala superior de un cargador sostenido con la otra mano.
Se usa el botón de agarre. Acercar el cartucho a la ventana de expulsión con la
corredera abierta llama a `Sidearm.seatCartridge()` y al estado común de firearm.
Solo se consume el objeto cuando la recámara acepta la bala; al cerrar no se
alimenta otra del cargador. Funciona también sin cargador. En AR los cartuchos
usan `XRItemContacts` y el mismo mundo físico que el resto del inventario; la
expulsión conserva el lanzamiento de `CasingMotion`. Los casquillos vacíos
siguen siendo efectos visuales, no munición. Hay un máximo de 24 cartuchos
sueltos, además de los sostenidos.

### Recuperar seguimiento al quitarse el casco

Una pose no nula no garantiza seguimiento de posición: WebXR puede marcarla con
`emulatedPosition`. `XRSessionController` no calibra suelo ni actualiza el ancla del mundo
con esas poses; `GameAR` pausa interacción y físicas hasta recuperar posiciones reales.
`ARRoom` tampoco guarda matrices estimadas o no finitas en las superficies de colisión.
La orientación puede seguir disponible durante ese intervalo sin que eso permita fijar suelo.

`GameXR.referenceSpace` expone la referencia que Three.js utilizó al principio del fotograma
para sus cámaras y mandos. La cámara de aplicación y las consultas de `ARRoom` usan esa misma
referencia. Una corrección del ancla puede instalar la referencia del siguiente fotograma,
pero no mezcla superficies calculadas en el espacio nuevo con cámaras del anterior.

Las pruebas cubren pérdida de visibilidad, posiciones estimadas de cabeza/suelo/ancla,
recuperación sin desplazar objetos y cambio de referencia entre fotogramas. No sustituyen
repetir quitarse y ponerse una Quest ni verifican errores del seguimiento del propio visor.

### F-14: velocidad y mando de gas

El preset compartido de Engine define 120 m/s en modo lento y 600 m/s en rápido,
con 40 m/s² de aceleración inicial. `stepFlight` equilibra empuje y resistencia
cuadrática para alcanzar la velocidad configurada; la amortiguación artificial del cuerpo
no reduce otra vez esa velocidad. Al desplegar las alas desde alta velocidad se limita
la desaceleración aerodinámica para evitar un frenazo instantáneo.

La simulación permanece a tamaño real: `XRScaledVehicles.pose()` convierte la posición
una sola vez a la escala elegida. A 1:100 son 1,2 y 6 m/s en la habitación; a 1:1 son
432 y 2160 km/h. Las pruebas comparan trayectorias a 1:1, 1:100, 1:500 y 1:1000.

En AR la seta izquierda adelante/atrás aumenta/reduce el gas; al centrarla mantiene el
valor. Izquierda/derecha controla el timón. La seta derecha controla cabeceo y alabeo,
y B alterna lento/rápido. No hay un segundo controlador de vuelo para la maqueta.

### Diagnóstico de botón Meta y relocalización

`XRSessionController.startDiagnostics()` activa muestras de seguimiento de 1 Hz;
`recordDiagnostic()` permite añadir marcadores del host y `exportDiagnostics()` devuelve
JSON. El registro conserva hasta 256 eventos: visibilidad, resets con su transformación,
alineación inicial, creación/error/pérdida de ancla, cambios de origen y muestras de cámara.
`ARRoom.trackingSnapshot()` añade matrices de hasta 32 superficies, sin imágenes ni vértices.

La demo ofrece Entorno → Iniciar prueba Meta y Enviar diagnóstico. Hay otro botón de envío
en la página de entrada por si el monitor queda fuera de alcance. El registro activo se
conserva en `nabla.xr.tracking-report.v1` para recuperarlo tras recargar. La instrumentación
no reintenta anclas ni corrige posiciones: sirve para observar el fallo sin cambiarlo.

En el host local, POST `/__nabla/xr-diagnostics` recibe el informe JSON (máximo 4 MiB)
y lo guarda en `/tmp/nabla-xr-report-last.json`. Este receptor pertenece a la configuración
de desarrollo, no al módulo de Engine ni al despliegue estático. Sin receptor, la demo
intenta copiar el JSON y, si el navegador lo impide, descargarlo como archivo.

### Selector R/C y tamaño en la habitación

El monitor presenta un carrusel de vehículos con imágenes de los modelos de Engine. Las flechas solo seleccionan; «Añadir» carga el vehículo. `scripts/prepare-vehicle-previews.mjs [origen HTTPS]` prepara los PNG con el mismo `SceneView` y calidad baja; no se cargan GLB al recorrer el selector. BMW aparece cuando el host aporta su preset.

Las escalas incluyen 1:200 y 1:500, además de 1:4 y 1:2 para coches y toro. Engine comprueba que la dimensión más larga del conjunto quede entre 2 cm y 5 m, incluido el remolque. Las escalas incompatibles se ocultan y `ARRC.load` las rechaza antes de retirar el vehículo existente. Las físicas mantienen sus unidades y parámetros originales.

La consola del toro se acerca 8 cm al volante y conserva la calibración independiente «AR · Palancas toro». El módulo experimental mantiene internamente Betaflight; su nombre visible es «Helicóptero».
