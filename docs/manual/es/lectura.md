# Presentación de esta edición

Este manual explica qué permite hacer Nabla Engine, cómo se utiliza y cómo se organizan sus componentes. Está dirigido a quienes crean aplicaciones, mantienen el motor, producen contenido o colaboran con agentes de programación. La edición técnica de referencia del repositorio se mantiene en inglés; esta edición en español facilita su lectura continuada en PDF.

La revisión original se realizó el 23 de octubre de 2026 sobre el paquete **0.3.9** y un árbol de trabajo basado en el commit `7015b8c25a083c8fa22e2d608d395ad74540e16c`. Había cambios locales del runtime y del juego de referencia. Por tanto, las descripciones corresponden a los archivos inspeccionados, no necesariamente al contenido de ese commit por sí solo. La versión del paquete se consulta en `package.json`.

En estas páginas, «implementado» significa que el comportamiento está presente en el código examinado. Un «ejemplo ejecutable» es un programa del repositorio con un comando para utilizarlo. Una compilación correcta no demuestra compatibilidad con todos los navegadores, visores, servicios remotos ni objetivos de rendimiento. Las limitaciones y discrepancias conocidas se señalan de forma explícita.

Los nombres de API, símbolos, rutas y comandos se conservan en su forma original para que puedan buscarse y copiarse. Cuando se menciona un archivo interno, eso no significa que su ruta sea una importación pública: el contrato de distribución lo establece el mapa `exports` de `package.json`.

## Cómo leer el manual

- Para crear una primera aplicación, empieza por los capítulos 1 a 4 y los ejemplos del apéndice D.
- Para modificar el motor, lee los capítulos 5 a 9, el subsistema correspondiente y los capítulos 23 a 25.
- Para producir contenido, céntrate en escenas, coordenadas y los capítulos 10 a 16.
- Para desplegar o resolver incidencias, consulta los capítulos 24 a 26 y el apéndice E.
- Si trabajas con un agente, haz que lea `AGENTS.md`, el capítulo relevante, sus archivos fuente y el registro de discrepancias antes de proponer cambios.

El motor, el juego de referencia, Atlas, Studio y Euskadi Online tienen responsabilidades diferentes. El código de este repositorio no sustituye la configuración de despliegue ni la documentación vigente de los otros proyectos.

## Organización

La primera parte introduce el motor y permite empezar a utilizarlo. La segunda desarrolla su arquitectura. La tercera explica mundos y contenido. La cuarta trata la presentación y la experiencia de usuario. La quinta reúne ampliación, diagnóstico, pruebas y despliegue. Los apéndices sirven como referencia de API, configuración, formatos, recetas y resolución de problemas.

# 1. Qué es Nabla Engine

**Parte I. Conocer y empezar a utilizar el motor**

Nabla Engine es una base en TypeScript para aplicaciones 3D interactivas. Sus componentes principales son los datos de escena validados, la física con Rapier, la presentación con Three.js, la carga progresiva de terreno geográfico y la composición de un runtime de navegador. Una aplicación puede utilizar el runtime completo o seleccionar módulos públicos independientes.

El motor puede representar un suelo de pruebas local, una escena anclada geográficamente o un mundo que carga contenido alrededor del jugador. Incluye desplazamiento a pie, interacción con vehículos, vehículos de ruedas y de dos ruedas, barcos y vuelo, equipamiento y monitores, armas, portales, audio espacial, adaptadores XR y componentes de multijugador. La madurez y los requisitos de integración varían entre estos sistemas. Su existencia no implica que haya un servicio de producción listo ni una tasa de imágenes garantizada.

## Los proyectos que lo rodean

| Componente                   | Responsabilidad                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------- |
| Engine, `src/`               | Contratos reutilizables, simulación, presentación y runtime.                    |
| Juego de referencia, `game/` | Entradas de navegador, selección del mundo, menús y enlaces con el anfitrión.   |
| Atlas                        | Generación y publicación del terreno que consume el motor.                      |
| Studio                       | Aplicación editora independiente que utiliza los módulos del motor.             |
| Euskadi Online               | Aplicación independiente con contenido, identidad visual e integración propios. |
| `services/`                  | Implementaciones auxiliares de caché, generación, pasarela y relay.             |

La definición física de un coche pertenece al contenido compatible con el motor. Decidir que ese coche está aparcado en una calle concreta de Euskadi pertenece al anfitrión. Un ajuste reutilizable pertenece a la configuración del motor; los créditos de apertura de un producto pertenecen a su aplicación.

## Elegir un punto de entrada

Para una primera prueba en navegador, utiliza `/?example=flat`. Para simular sin renderer, utiliza `PlaySession`. Si quieres controlar directamente el mundo físico y sus pasos, existe `@nabla/engine/vehicles/wheeled`. Son niveles de integración distintos: cuanto más bajo sea el nivel, mayor responsabilidad asumes sobre composición, reloj y liberación de recursos.

El adaptador `experimental/betaflight` es experimental. WebGPU es una opción explícita con mecanismo de retorno a WebGL. La autoridad de red resuelve determinadas decisiones compartidas, pero no constituye una simulación física completa ejecutada en un servidor. La compatibilidad con las publicaciones de terreno necesita las comprobaciones del capítulo 10.

**Fuentes:** `package.json`, `src/runtime/browser.ts`, `src/runtime/session.ts` y `src/experimental/betaflight/index.ts`.

# 2. Instalación y entorno de desarrollo

El paquete requiere Node.js 22.12 o posterior y npm. El archivo de bloqueo registra las dependencias; utiliza `npm ci` para reproducir la instalación. Salvo indicación contraria, ejecuta los comandos desde la raíz del repositorio.

```sh
npm ci
npm run build
npm run dev
```

La compilación de la biblioteca genera `dist/`. El servidor de desarrollo utiliza `vite.game.config.ts` y el puerto 5174 con `strictPort: true`. Si está ocupado, identifica el proceso existente y conserva deliberadamente el origen de pruebas. El paso `predev` prepara los paquetes de recursos.

Abre `http://localhost:5174/?example=flat` para contenido incluido o `http://localhost:5174/test.html` para la entrada de pruebas. Si tienes HTTPS configurado, utiliza esas mismas rutas sobre el origen HTTPS. `/headset.html` permite seleccionar experiencias para visor.

## HTTPS y otros dispositivos

La configuración de Vite lee conjuntamente `NABLA_HTTPS_CERT` y `NABLA_HTTPS_KEY`. Proporcionar solo una variable es un error. Sus valores son rutas de archivos, no el contenido PEM. En PowerShell:

```powershell
$env:NABLA_HTTPS_CERT = 'C:\certificates\local-cert.pem'
$env:NABLA_HTTPS_KEY = 'C:\certificates\local-key.pem'
npm run dev
```

Sustituye las rutas por certificados reales y comprueba que el dispositivo confía en el certificado del nombre de host utilizado. El `localhost` de un visor es el propio visor. El servidor escucha en `0.0.0.0`; desde otro dispositivo debes usar un nombre o dirección accesible del ordenador de desarrollo.

## Estructura del repositorio

`src/` contiene la implementación reutilizable; `game/` la compone; `assets/` contiene recursos; `examples/` demuestra importaciones públicas; `test/` reúne regresiones; `scripts/` contiene herramientas de compilación y preparación. `docs/reference/` es documentación generada del código. El manual explica relaciones, decisiones y procedimientos.

Para trabajar con generación y caché de terreno existe una pila de desarrollo opcional:

```sh
docker compose -f compose.dev.yaml up --build -d
```

Consulta `docs/local-development.md` antes de utilizarla. No es necesaria para el ejemplo plano. El consumo de terreno publicado tiene además la discrepancia de contrato descrita en el capítulo 10.

Tras modificar el juego local, `AGENTS.md` pide reiniciar el servidor y conservar HTTPS y la configuración de pruebas. Un cambio exclusivamente documental no modifica el juego ni necesita reiniciar ese servidor.

**Fuentes:** `package.json`, `vite.game.config.ts`, `CONTRIBUTING.md` y `AGENTS.md`.

# 3. Tu primera aplicación

Empieza con una escena local para que la disponibilidad de red no forme parte de la primera prueba. Una escena necesita versión, nombre y entidades válidas, incluido exactamente un punto de aparición. `createEntity` proporciona valores estructurales predeterminados, pero no configura completamente todos los tipos: un vehículo necesita también su definición.

El archivo `examples/manual/scene.mjs` crea un suelo estático, un punto de aparición y un coche compacto procedural. Llama a `parseScene` antes de devolver el documento para detectar errores en la frontera de datos. El centro del suelo está en Y = -0,5 y su altura es un metro: su cara superior coincide con Y = 0.

## Ejecutar sin navegador

```sh
npm run build
node examples/manual/session.mjs
```

El programa crea una `PlaySession`, llama a `play` con `physicsWorker: false`, deja asentarse el coche, entra en él, aplica avance y ejecuta intervalos de tiempo fijos. Comprueba que se mueve, que la pausa y la reanudación funcionan y que la simulación no ha modificado el documento original. Un bloque `finally` libera la sesión.

El programa es propietario del reloj; la sesión es propietaria de la simulación. No debes liberar por separado la simulación que devuelve la sesión ni ejecutar un segundo reloj sobre ella. La selección de física en el hilo principal sirve para este ejemplo en Node; no es una recomendación para desactivar workers en el juego.

## Montar el runtime de navegador

`examples/manual/browser.ts` exporta `mountManualGame(canvas)`. Se utiliza desde una aplicación TypeScript con empaquetador para navegador. Importa `GameRuntime` desde `@nabla/engine/runtime/browser`, proporciona la escena, activa el HUD e inicia la partida. Devuelve una función de limpieza que la aplicación debe invocar al desmontar la vista o cambiar de ruta.

La escena incluye un anclaje geográfico sin imágenes en línea porque el runtime de navegador exige `geography`, incluso con un suelo local. No se proporciona `tiles`, por lo que ese anclaje no solicita terreno geográfico.

El canvas necesita un contenedor con dimensiones reales. Para ocupar la ventana, el contenedor puede utilizar `position: relative; width: 100vw; height: 100vh`, y el canvas `display: block; width: 100%; height: 100%`. La aplicación controla esa maquetación. El runtime controla su bucle: no añadas otro `requestAnimationFrame` que también avance la física.

El ejemplo desactiva audio y mar visible. El coche procedural evita depender de un GLB, aunque el runtime completo puede solicitar recursos de presentación compartidos. Deben servirse como explica el capítulo 4. Este ejemplo es un módulo, no una página HTML publicada automáticamente.

## Experimentos útiles

Cambia la masa y la fuerza del motor y compara la velocidad tras el mismo tiempo simulado. Omite `vehicleId` para comenzar a pie. Añade una caja estática y compara su apariencia con sus dimensiones físicas. Conserva un cambio por prueba para saber qué provoca el resultado.

**Fuentes:** `src/scene/document.ts`, `src/entity/schema.ts`, `src/runtime/session.ts` y `src/runtime/browser.ts`.

# 4. Utilizar el motor desde otro proyecto

La frontera de integración pública es el mapa `exports` de `package.json`. Que un archivo exista en `src/` no significa que pueda importarse desde un paquete instalado. El apéndice A se deriva de ese mapa.

## Instalar un paquete compilado localmente

```sh
npm run build
npm pack
```

Ejecuta esos comandos en el repositorio del motor. Desde el proyecto consumidor, instala la ruta del archivo que muestre npm. No codifiques una versión fija en automatizaciones: utiliza el nombre realmente generado. `npm pack --dry-run` permite inspeccionar el contenido sin crear el archivo.

| Nivel                  | Importación pública              | Lo que aporta la aplicación                    |
| ---------------------- | -------------------------------- | ---------------------------------------------- |
| Datos validados        | `@nabla/engine/scene`            | Datos y persistencia.                          |
| Sesión sin renderer    | `@nabla/engine/runtime/session`  | Reloj y entrada lógica.                        |
| Coordinador de juego   | `@nabla/engine/runtime/core`     | Renderizado, planificación y dispositivos.     |
| Runtime completo       | `@nabla/engine/runtime/browser`  | Canvas, escena, opciones e interfaz propia.    |
| Vehículo independiente | `@nabla/engine/vehicles/wheeled` | Mundo físico compartido y pasos de simulación. |

Hay dos clases exportadas con el nombre `GameRuntime`. `runtime/core` reexporta el coordinador de `runtime/game.ts`; `runtime/browser` implementa la composición completa de navegador. Sus constructores y responsabilidades son diferentes. Conserva siempre la ruta de importación al copiar un ejemplo.

## Publicar los recursos

Instalar JavaScript no publica automáticamente modelos, texturas, sonidos ni las URL de workers. El anfitrión Vite de referencia utiliza `assets/` como directorio público. Otro anfitrión debe ofrecer rutas equivalentes o configurar las recetas correspondientes. Antes de investigar shaders o modelos, revisa las solicitudes fallidas en la pestaña de red.

Comprueba también la compilación de producción y sus workers. Que Vite resuelva módulos durante desarrollo no demuestra que el paquete distribuido funcione. `scripts/check-package.mjs` ejecuta ejemplos contra un paquete instalado y ayuda a detectar importaciones que solo funcionan dentro del repositorio.

## Componer el juego de referencia

Una aplicación también puede utilizar `game/` desde una revisión fijada del motor. Los puntos inspeccionados incluyen `setTerrainHost` y `setDriveHost`, que deben registrarse antes de ejecutar la entrada de página. Esto es composición a partir de fuentes, no una garantía del mapa de exportaciones npm.

Mantén coordenadas regionales, identidad visual, selección de sala y presentación de apertura en el anfitrión. Consulta `docs/game-runtime.md` para el flujo concreto.

**Fuentes:** `package.json`, `src/runtime/game.ts`, `game/terrain-host.ts`, `game/drive-host.ts` y `docs/asset-packs.md`.

# 5. Arquitectura y responsabilidad de los módulos

**Parte II. Cómo funciona el motor**

La separación principal está entre datos de autoría, simulación autoritativa y presentación. El documento guardado describe la escena deseada. La simulación deriva de él cuerpos y estados mutables. La presentación lee esos estados y los muestra. Guardar la escena original no debe serializar accidentalmente una posición transitoria causada por una colisión.

El flujo conceptual es: aplicación anfitriona, runtime de navegador, sesión, simulación y estados de ejecución. La presentación consume esos estados y dibuja con Three.js. El terreno alimenta tanto la presentación como la instalación de colisiones. Ambas deben compartir datos espaciales compatibles, aunque tengan presupuestos y momentos de trabajo diferentes.

| Propietario                | Responsabilidad principal                                        |
| -------------------------- | ---------------------------------------------------------------- |
| `entity/`, `scene/`        | Esquemas, validación, transformaciones y transacciones.          |
| `simulation/`              | Física, controladores, consultas y estado transitorio.           |
| `planet/`                  | Matemática geográfica, contratos y adaptación del terreno.       |
| `render/`, `presentation/` | Objetos visibles, recursos, efectos y vistas de terreno.         |
| `runtime/`                 | Composición de sesión, entrada, cámara, audio y navegador.       |
| `catalog/`                 | Definiciones concretas y selección de presentación.              |
| `game/`                    | Aplicación de referencia y conexiones específicas del anfitrión. |

## Fronteras importantes

La simulación no debe depender del DOM ni del renderer para avanzar. El renderizado no debe importar módulos del juego de referencia. El runtime de navegador sí es propietario de escuchadores DOM y recursos GPU: las afirmaciones históricas de que todo el motor está libre de DOM no describen esta capa actual.

El esquema de entidades no implica una API pública universal de ECS o creación de objetos. Utiliza las fábricas de escena, catálogos y métodos realmente disponibles. El presentador genérico y el presentador con contenido estándar también son distintos: la composición pública `SceneView` aporta instrumentos y adaptadores predeterminados.

## Ejemplo de decisión arquitectónica

Si un vehículo necesita un monitor retráctil, guarda dimensiones y anclajes en el contenido, anima el conjunto visible en presentación y expón el control a través del runtime. Si afecta a colisiones, modifica el cuerpo existente mediante su propietario físico. No crees un segundo mundo para ese monitor ni deduzcas su comportamiento a partir de un nombre visible.

Consulta las pruebas de arquitectura antes de mover una función entre capas. La ubicación de un archivo debe reflejar quién posee su estado, qué puede importar y quién debe liberarlo.

**Fuentes:** `docs/architecture/module-map.md`, `src/runtime/session.ts`, `src/runtime/browser.ts`, `src/presentation/scene-view.ts` y `test/architecture/`.

# 6. Ciclo de vida y ejecución

`PlaySession` expone los estados `stopped`, `loading`, `playing`, `paused` y `disposed`. `play(document, options)` detiene la sesión anterior, clona el documento, inicializa la física y construye una simulación. Un contador de generación evita que una inicialización asíncrona tardía reactive una sesión cancelada.

Cuando se solicita física en worker, intenta crear `ThreadedSimulation`. Si falla y la inicialización no se ha cancelado, vuelve a la simulación en el hilo principal. `vehicleId` solicita un vehículo inicial. Antes de devolver la simulación, la inicialización actualiza el estado procedente del worker. Comprueba el modo realmente utilizado, no solo la opción solicitada.

## Avanzar, pausar y detener

`step(elapsed, input, waterLevel)` recibe segundos, rechaza duraciones negativas o no finitas, instala la entrada y solo avanza cuando está en `playing`. Limita el intervalo mediante `simulationDefaults.maxFrameSeconds`. La ejecución en worker tiene su propia ruta; el navegador utiliza estados encadenados sin esperar de forma síncrona a cada tick físico.

`pause()` limpia los comandos de movimiento y suspende el avance. El tiempo pausado no se acumula para una recuperación posterior. `resume()` reanuda una sesión pausada. `stop()` cancela inicialización y libera física, pero permite volver a jugar. `dispose()` es terminal y puede repetirse sin duplicar la liberación.

Una promesa rechazada por `play()` es un fallo real. Si abandonas el montaje, libera también los recursos creados por el anfitrión. El ejemplo de sesión del apéndice D demuestra las transiciones sin planificación de navegador.

## Arranque en navegador

El anfitrión resuelve la fuente del mundo, crea documento y runtime, espera suelo utilizable cuando corresponde, inicia física, prepara presentación y revela el juego. La preparación puede incluir vehículos, audio, terreno, shaders, texturas y vistas iniciales de cámara. Unos créditos o un botón de entrada pueden retrasar deliberadamente la revelación.

`onProgress(status, loadedTiles)` informa de trabajos distintos. Si no hay lista de celdas, el mensaje de estado no debe sustituirse por un contador antiguo. Los hitos representan fases conocidas, no un porcentaje universal de descarga ni una estimación fiable del tiempo restante.

Con `clock: 'automatic'`, el runtime es propietario de la planificación. Si integras un reloj manual, inspecciona el contrato vigente y conserva un único propietario del avance. No avances por separado la sesión y su simulación.

**Fuentes:** `src/runtime/session.ts`, `src/simulation/threaded-simulation.ts`, `src/runtime/browser.ts`, `game/loading.ts` y `docs/game-runtime.md`.

# 7. Escenas, entidades y datos de autoría

Un `SceneDocument` es JSON validado, actualmente de versión 1. Requiere `version`, `name` y `entities`. Puede contener cursor, geografía, cielo y agua. El parser normal limita la escena a 20.000 entidades. Existe una opción experimental para escenas grandes, pero no supone rendimiento ilimitado.

Las entidades tienen ID estable, nombre editable, referencia al padre, transformación rígida, tamaño, color, movimiento y masa. Los tipos del esquema son `group`, `box`, `vehicle`, `spawn`, `solid` y `terrain`. Cargas opcionales como `vehicle`, `visual`, `portal`, `light` o `geometry` describen capacidades. El tipo y su carga deben ser compatibles.

## Validación e identidad

Llama a `parseScene(raw)` al importar datos. Comprueba estructura y relaciones: IDs duplicados, padres ausentes, ciclos, aparición del jugador, transformaciones y restricciones particulares. Un JSON sintácticamente correcto puede representar una escena inválida.

El parser también llama a `migrateStockAssetUrls`. Por eso no es exacto afirmar que nunca normaliza nada. Esta migración concreta de URL no implica conversión general de versiones ni ajuste automático del contenido a los nuevos valores predeterminados.

Utiliza IDs para referencias y nombres para etiquetas. Cambiar un nombre no debe modificar física. Las posiciones son relativas al padre. Los cuerpos dinámicos y el punto de aparición obedecen restricciones de raíz: una jerarquía visual arbitraria no es automáticamente una jerarquía física válida. El tamaño es explícito y no funciona como escala heredada.

## Editar y guardar

`SceneGraph` resuelve transformaciones de autoría. `SceneEditor` proporciona edición validada e historial. Una transacción fallida debe dejar utilizable el documento anterior. Durante la partida, las posiciones mutables pertenecen a la simulación. Guarda el documento de autoría salvo que la aplicación implemente expresamente una captura del estado de ejecución.

Para añadir una caja al ejemplo, crea una entidad `box`, establece `motion: 'dynamic'`, elige masa y tamaño, colócala sobre el suelo e inclúyela antes de `parseScene`. Serializa el documento devuelto mediante `JSON.stringify` dentro del flujo de almacenamiento o exportación del anfitrión.

La importación externa, la sustitución de mapas en streaming y la edición interactiva utilizan rutas internas diferentes. No reutilices una transacción optimizada de mapas como si fuera un importador externo sin validación.

**Fuentes:** `src/scene/document.ts`, `src/entity/schema.ts`, `src/scene/graph.ts`, `src/scene/history.ts` y `src/scene/asset-urls.ts`.

# 8. Coordenadas y representación del mundo

La convención local utiliza metros, segundos y kilogramos, con Y hacia arriba y -Z hacia delante. En el marco geográfico local, +X apunta al este y -Z al norte; por tanto, +Z apunta al sur. Las rotaciones guardadas son cuaterniones unitarios en orden `[x, y, z, w]`.

Los ángulos de interfaz y los del runtime no siempre usan las mismas unidades. Comprueba cada API, especialmente rumbo, yaw de cámara y duración de transiciones.

| Magnitud                   | Representación                           |
| -------------------------- | ---------------------------------------- |
| Posición de entidad        | `[x, y, z]` en metros respecto al padre. |
| Rotación de entidad        | Cuaternión unitario `[x, y, z, w]`.      |
| Posición geográfica        | Latitud, longitud y altitud.             |
| Celda geográfica           | `{ z, x, y }` en Web Mercator.           |
| Desplazamiento en celda    | `dx` al este y `dz` al sur, en metros.   |
| Tiempo físico transcurrido | Segundos.                                |

## Convertir una ubicación

El módulo público `@nabla/engine/planet/lat-lon` acepta formatos habituales de coordenadas. `parseLatLon` devuelve `undefined` cuando la ubicación no es válida:

```js
import { parseLatLon, tileOffsetFromGeo } from '@nabla/engine/planet/lat-lon'

const location = parseLatLon('43.3386, -1.7899')
if (!location) throw new Error('Ubicación geográfica inválida')
const { tile, dx, dz } = tileOffsetFromGeo(location)
console.log(tile, dx, dz)
```

El ejemplo de contratos ejercita esta API. El parser admite formatos decimales y hemisferios. La cuadrícula Web Mercator excluye las regiones polares más allá de su límite: que el esquema general permita latitudes de hasta 90 grados no hace válida cualquier conversión de celda.

## Geometría local y escala planetaria

Convierte mediante las funciones explícitas. No trates grados como metros ni intercambies longitud y latitud por intuición. La geografía ancla la escena y aporta contexto al cielo, pero no descarga terreno por sí sola ni garantiza una superficie física en el punto de aparición.

El renderizado a gran distancia y la física local tienen necesidades de precisión diferentes. La presentación utiliza marcos geográficos y técnicas relativas a la cámara cuando corresponde. No corrijas un desplazamiento lejano multiplicando posiciones guardadas por una escala arbitraria: revisa anclaje, conversión, altitud y transformación de importación del modelo.

Una comprobación útil consiste en colocar dos entidades separadas diez metros en X. Tras una conversión geográfica de ida y vuelta, la distancia debe mantenerse dentro de la tolerancia numérica pertinente.

**Fuentes:** `src/planet/lat-lon.ts`, `src/math/geo/sphere.ts`, `src/scene/mercator.ts` y `src/math/frame/vectors.ts`.

# 9. Física y simulación

Cada `Simulation` posee un mundo Rapier. Los controladores de vehículo, el personaje, las colisiones de terreno y las interacciones trabajan dentro de esa propiedad. Las mallas visibles no se convierten automáticamente en colisionadores: el comportamiento depende de definiciones físicas explícitas.

Los valores revisados establecen un paso fijo de `1 / 60` segundos, `maxSubsteps: 8`, `maxFrameSeconds: 0.1` y gravedad de 9,81 m/s². La sesión limita la duración recibida y la simulación acota la recuperación de pasos. El tiempo fijo mejora la integración predecible, pero no garantiza determinismo bit a bit entre plataformas. La fuente vigente es `src/config/simulation.ts`.

## Entrada y presentación

`PlayerInput` expresa comandos lógicos independientes del teclado. `idleInput()` proporciona entrada neutra. Instala la entrada antes de avanzar. El runtime de navegador compone dispositivos y planificación; quien utiliza una simulación independiente debe aportar ambos.

El estado físico y el estado visual interpolado tienen funciones diferentes. Las consultas y colisiones utilizan estado autoritativo. La presentación puede interpolar instantáneas para evitar saltos visibles entre pasos fijos. No realimentes una posición visual interpolada como si fuera una nueva medida física autoritativa.

Los teletransportes y portales deben reiniciar el historial de interpolación, evitando que el personaje recorra visualmente todo el espacio intermedio.

## Ampliar el comportamiento físico

Si controlas directamente un mundo, utiliza las interfaces exportadas de física y de familias de vehículo. `examples/modularity/wheeled-runtime.mjs` demuestra ese nivel. El consumidor controla pasos y liberación; no dupliques esa responsabilidad con una `PlaySession` sobre los mismos objetos.

Para investigar una colisión, reduce el caso a un suelo y un obstáculo. Comprueba dimensiones, transformaciones, tipo de movimiento e instalación real antes de cambiar el solver. En terreno cargado progresivamente, ver una celda no demuestra que todas sus colisiones cercanas estén listas.

El ejemplo de vehículo sin navegador comprueba entrada, arranque y aceleración. Es una regresión funcional, no una certificación de dinámica real. Algunos ajustes de motocicleta aparecen expresamente como `TODO(unverified)` y deben tratarse como valores de jugabilidad.

**Fuentes:** `src/simulation/simulation.ts`, `src/simulation/physics-api.ts`, `src/config/simulation.ts`, `src/simulation/simulation-worker-host.ts` y `test/simulation/`.

# 10. Terreno geográfico y carga progresiva

**Parte III. Mundos y contenido**

`PlanetWorld` administra el mundo visible alrededor del jugador. Selecciona celdas, solicita datos, prepara geometría e imágenes, instala presentación y retira contenido lejano. La instalación de colisiones tiene trabajo y presupuestos propios. Distancia de dibujado, detalle fotográfico y distancia de colisión están relacionadas, pero no son tres nombres para el mismo radio.

## Contrato de publicación verificado

El 23 de octubre de 2026 se consultaron las celdas 15/16223/11999 y 15/16224/11999. Ambas devolvieron HTTP 200 para esta estructura:

```text
https://atlas.chained.world/euskadi/terraform/
  z/15/<x>/<y>/manifest.json
  z/15/<x>/<y>/z15-<hash>.json
  z/15/<x>/<y>/<archivos indicados por el paquete>
```

La afirmación anterior de que no existía `manifest.json` estaba desactualizada. El manifiesto de entrada usa `nabla-planet-tile-v1` y su puntero `z15Package` identifica el paquete `nabla-z15-package/1`, con tamaño y SHA-256. Ambos paquetes descargados coincidieron con esos datos. Las respuestas originales se conservan en fixtures fechadas, junto con su procedencia.

El lector actual acepta ambos conjuntos de metadatos. Las celdas publicadas tienen versión 4; la adaptación selecciona el terreno unificado LiDAR para versiones 2 o superiores. Esta comprobación verifica carga, integridad y adaptación de metadatos; no certifica visualmente todos los recursos del terreno.

Conserva el prefijo `z/` y sigue el puntero exacto del manifiesto, sin adivinar hashes ni listar el bucket. Un paquete Z15 bruto no es un manifiesto de entrada: `manifestFiles` cambia nombres, no el esquema ni el descubrimiento. No hace falta cambiar el contrato para estas publicaciones. La evidencia y el procedimiento de actualización están en `docs/terrain-publication-contract.md`.

## Proxy y tratamiento de errores

Según `AGENTS.md`, Atlas no envía cabeceras CORS. El navegador debe utilizar `/tiles` en el mismo origen. Vite elimina ese prefijo y reenvía al servidor configurado. Producción necesita un proxy equivalente. Compila con `VITE_NABLA_TILES_URL=/tiles` cuando esa sea la ruta publicada.

El proveedor estático genérico interpreta `[404]` como ausencia por defecto y acepta `missingStatuses`. PlanetWorld pasa `[403, 404]` para las entradas. Un paquete ausente al que apunta una entrada existente es un error de publicación, no un hueco silencioso. No reinterpretar universalmente los 403 de cualquier servicio. Distingue objeto ausente, fallo de red/CORS, tiempo agotado, JSON inválido, incompatibilidad de esquema y fallo de tamaño o hash.

## Ciclo de carga

Los modos iniciales distinguen suelo utilizable en la aparición, cobertura cercana y una zona finita solicitada explícitamente. Tras revelar el juego se amplía la carga normal. Descargar y decodificar puede ocurrir en workers, pero la instalación de escena, subida GPU y compilación de shaders siguen teniendo coste.

El contrato actual acepta versiones de celda 1 a 4. Las versiones de suelo unificado incorporan carreteras al terreno; superponer asfalto antiguo puede duplicar superficies. Esquema, versión de celda, revisión geométrica, zoom y hash responden a preguntas distintas. Valida cada uno.

Para trabajar sin depender de Atlas, utiliza la escena de suelo de caja del capítulo 3. Los recursos Z15 planos incluidos son otra fixture de pruebas, no prueba de publicación de una celda geográfica real.

**Fuentes:** `AGENTS.md`, `src/render/planet/static-tiles.ts`, `src/planet/atlas-z15.ts`, `src/planet/contract.ts`, `src/render/planet/world.ts`, `game/terrain-main.ts` y `vite.game.config.ts`.

# 11. Recursos y catálogos de contenido

Un recurso aporta representación; una definición aporta comportamiento. Un GLB no define por sí solo suspensión, inventario o conexiones de portales. Mantén explícitos transformación de importación, anclajes, definición física y registro de catálogo para poder inspeccionarlos por separado.

`assets/library/` reúne familias de modelos y recetas. Los catálogos convierten esas recetas en presets reutilizables. `visual` describe URL y presentación; `vehicle` contiene datos físicos y de control. El nombre del archivo o la etiqueta visible no deben seleccionar comportamiento implícitamente.

## Incorporar contenido

1. Registra procedencia y condiciones de redistribución del recurso.
2. Normaliza escala y orientación o declara una transformación de importación explícita. Compáralo con un objeto de tamaño conocido.
3. Define colisiones independientemente del detalle visual.
4. Añade receta y registro en el catálogo adecuado.
5. Comprueba la compilación de producción, incluidas variantes de calidad y empaquetado.

Para empezar sin un modelo externo, utiliza el compacto de `examples/manual/scene.mjs`. Para uno modelado, consulta `docs/vehicle-definition.md` y una receta de la misma familia. Copiar una malla de coche no hace adecuados sus parámetros para una motocicleta o un barco.

## Distribución y vida útil

`npm run assets:pack` prepara paquetes de recursos. La compilación del juego tiene un paso de finalización: publicar solo JavaScript puede dejar URL de modelos sin resolver. El detalle de distribución está en `docs/asset-packs.md`.

El cargador comparte recursos cuando corresponde, mientras cada instancia conserva sus transformaciones y parte del estado de materiales. Libera recursos a través del propietario correspondiente. No destruyas una textura compartida simplemente porque desaparece un vehículo. Las variantes de calidad y el precalentamiento pertenecen a carga y presentación, no a identidad física.

Una prueba práctica consiste en crear dos instancias, retirar una y verificar que la otra sigue correcta. Comprueba también un recurso ausente: el error debería identificar la URL, no presentarse como un fallo físico misterioso.

**Fuentes:** `assets/README.md`, `src/render/entity/assets.ts`, `src/render/entity/asset-quality.ts`, `scripts/pack-assets.mjs` y `src/catalog/vehicles/index.ts`.

# 12. Vehículos

Un vehículo combina entidad, definición validada, perfil de control y presentación opcional. Tamaño y masa pertenecen a la entidad. El bloque de vehículo define ruedas, suspensión, fuerzas, asientos y cámaras. Las recetas concretas pertenecen a catálogos o al contenido de la aplicación.

## Crear y conducir

Utiliza `presetVehicle` para un vehículo existente. Para uno procedural, combina `createEntity` y `vehicleDefinition`. El ejemplo completo crea un compacto, valida la escena, entra en él y comprueba aceleración:

```sh
npm run build
node examples/modularity/custom-prefab.mjs
```

Parte de una definición conocida y cambia un grupo de parámetros cada vez. Comprueba posición de ruedas y recorrido de suspensión antes de compensar con fuerza de motor. Revisa masa y colisionadores antes de ajustar frenos. Encendido y aparcamiento forman parte del estado: acelerar justo después de entrar no equivale a tener un motor ya arrancado y preparado para circular.

## Familias

Los runtimes de ruedas y de dos ruedas tienen entradas públicas separadas. El segundo añade equilibrio, desplazamiento del piloto, frenado, cabeceo y accidentes. Barco y vuelo pueden funcionar independientemente con un mundo físico compartido y un entorno inyectado. `examples/modularity/boat-flight.mjs` muestra esa composición.

El contenedor de escena y simulación de alto nivel aún comparte algunos campos orientados a ruedas. No deduzcas de las API independientes que todos los esquemas superiores estén totalmente desacoplados. Parte de la presentación de barcos y aeronaves sigue siendo específica de modelos concretos. Son límites actuales, no una API universal de creación implícita.

## Interacción, equipo y daños

Entrar y salir cambia el estado físico del jugador. La salida necesita soporte y espacio libre. Remolques, atraque, restricciones de carga y carretillas utilizan la propiedad de simulación existente; no deben crear cuerpos competidores para una misma entidad.

Daño y destrucción visual son capas distintas. Humo y escombros no son el estado autoritativo de salud. Al añadir una familia, prueba aparición, entrada, encendido, conducción, parada, salida, recuperación y liberación. Añade recorridos de remolque o vuelo cuando proceda.

Los ajustes incluyen supuestos de jugabilidad. Una motocicleta convincente visualmente no demuestra precisión medida de suspensión ni frenado.

**Fuentes:** `src/entity/vehicle/field.ts`, `src/entity/vehicle/vehicle.ts`, `src/simulation/vehicles/wheeled/runtime.ts`, `src/simulation/vehicles/two-wheeled/runtime.ts` y `src/simulation/vehicle-damage.ts`.

# 13. Presentación y equipamiento de vehículos

La presentación transforma telemetría física en luces, instrumentos, espejos, piezas móviles, postura, escape y efectos. `visual.presentation` selecciona un adaptador de forma explícita. Si falta ese ID, no debe adivinarse equipamiento a partir del nombre de archivo.

El renderer genérico y el presentador estándar tienen funciones de composición diferentes. `SceneView` incorpora presentación de vehículos de carretera e instrumentos predeterminados. Un anfitrión puede sustituirlos. Prefiere adaptadores y anclajes declarados a condiciones por cada ID dentro del renderer.

## Preparar un modelo

Utiliza las convenciones GLB de las guías de definición y rigs. Materiales como `nabla.light.<role>` y metadatos de anclaje permiten localizar equipo. La receta selecciona adaptador y configuración. La forma de colisión permanece en la definición física.

Para un cuadro nuevo, define primero monitor y correspondencia con telemetría. Después colócalo en el anclaje del modelo. Comprueba velocidad y RPM de forma independiente antes de depurar una escena completa. `/monitors` aporta monitores por capas; `/monitors/html` y `/menus` exponen otras composiciones.

## Verificación de rigs

```sh
npm run rigs:check
npm run rigs:test
```

Si cambian las fuentes de un rig, ejecuta `npm run rigs:generate`, revisa el diff y repite las comprobaciones. Los datos generados son una salida: no edites ahí a mano el anclaje original de un modelo.

Valida faros y estados de freno, marcha atrás e intermitentes por separado. Para espejos, revisa lente, cámara y orientación configurada antes de girar el chasis completo. Comprueba las piezas móviles en reposo y con el vehículo en movimiento. Una animación de presentación no debe cambiar silenciosamente dimensiones físicas.

Reutiliza políticas de material e iluminación. Evita arreglos particulares que oculten un recurso mal preparado. Un adaptador documentado es adecuado cuando el equipamiento real es diferente.

**Fuentes:** `src/render/vehicle-presentation/index.ts`, `src/catalog/presentation/road-vehicles.ts`, `src/render/vehicle-presentation/authored-lights.ts`, `docs/vehicle-rigs.md` y `docs/creating-a-monitor.md`.

# 14. Personajes e interacción

El personaje combina movimiento físico, animación visible, inventario e interacción. Mantén separados sus propietarios de estado. Una mano visible no determina si se posee un objeto; una ranura de inventario no es por sí misma un objeto físico en el suelo.

`CharacterInventory` representa objetos transportados y ranuras corporales. `WeaponLoadout` coordina arma seleccionada, munición, recogida, abandono y posibilidad de disparar. Las decisiones disputadas del mundo se delegan en `GameAuthority`. Renderer y HUD leen el estado; no mantienen inventarios paralelos.

## Movimiento y vehículos

La simulación controla movimiento y contacto con soportes. El runtime traduce la entrada a caminar, saltar, conducir y otros contextos. Entrar y salir de un vehículo no consiste simplemente en mover la cámara: es una transición física. Salir exige una posición utilizable y libre de obstáculos.

La representación del avatar sigue movimiento y equipamiento. La postura del conductor y la animación del piloto pertenecen a presentación, con efectos físicos cuando el modelo los admite explícitamente. Cambiar una animación no debe alterar accidentalmente la propiedad de un asiento u objeto.

## Diseñar una interacción

Para un objeto recogible, define su tipo, representación y reglas de inventario. Envía la solicitud a la autoridad y aplica después el evento resultante. Prueba dos solicitudes para el mismo objeto: solo una debe concederlo. `examples/manual/contracts.mjs` demuestra el caso con `LocalAuthority` y limpia la suscripción.

Si añades un dispositivo de control, invoca la acción lógica existente en lugar de mutar campos internos. Teclado, gesto XR, pantalla táctil y actor dirigido por un agente deben obedecer las mismas reglas. Al cambiar ranuras corporales, revisa inventario y anclajes visibles para que el objeto se muestre en el lugar correcto.

Comprueba interacción a pie, sentado, en pausa y tras liberación o reconexión. Los rechazos dependientes del estado necesitan una razón que el anfitrión pueda mostrar. Reintentar una acción no disponible no debe duplicar objetos ni escuchadores.

**Fuentes:** `src/character/index.ts`, `src/character/inventory.ts`, `src/character/body-slots.ts`, `src/character/weapon-loadout.ts`, `src/simulation/simulation.ts` y `src/render/entity/avatar.ts`.

# 15. Armas y combate

Las armas combinan equipamiento, máquina de estados, consultas físicas o proyectiles, decisiones de daño y efectos. Un fogonazo no demuestra un impacto; recibir un evento remoto de disparo no autoriza a cambiar localmente la salud de otro jugador.

`WeaponLoadout` determina si hay un arma desenfundada y apta. Puede rechazar una acción por estar desarmado, con arma guardada, sin munición, muerto o sosteniendo algo que no es un arma de fuego. Los módulos de arma manejan cargador y cadencia; arco y flechas tienen comportamiento propio de tensado y vuelo.

## Flujo conceptual

1. Una acción lógica llega al equipamiento o runtime.
2. El estado del arma decide si puede ejecutarse.
3. La consulta o trayectoria física resuelve la interacción.
4. Los resultados compartidos pasan por la autoridad cuando corresponde.
5. La presentación muestra retroceso, fogonazo, vainas, marcas y sonido.

Este orden es conceptual: inspecciona la ruta del arma concreta antes de modificar el detalle. Munición y efectos remotos no comparten necesariamente la misma autoridad. El capítulo de red explica los límites del relay.

## Añadir o ajustar un arma

Parte de una definición de la misma familia. Revisa ranura, cargadores, reglas de munición, postura, modelo, sonido y disparo. Ajusta cámara y postura por separado de balística y daño. `src/config/gameplay-tuning.ts` centraliza parámetros compartidos; evita copias divergentes en HUD y XR.

Puedes ejecutar regresiones enfocadas:

```sh
npx vitest run test/simulation/recoil.test.ts test/simulation/machine-pistol.test.ts test/weapons/bow.test.ts
```

Después prueba en navegador desenfundar, disparar, vaciar, recargar, guardar, cambiar contexto y soltar/recoger. Comprueba que los efectos se detienen al liberar recursos y que un evento remoto no aplica dos veces el daño. El arco requiere pruebas propias; no basta con reutilizar supuestos de armas de fuego.

**Fuentes:** `src/character/weapon-loadout.ts`, `src/simulation/weapons/firearm.ts`, `src/simulation/weapons/magazine.ts`, `src/simulation/weapons/ballistics.ts`, `src/simulation/weapons/bow.ts`, `src/simulation/weapons/arrow-flight.ts`, `src/simulation/combat/damage.ts` y `src/runtime/shooting.ts`.

# 16. Portales

Los portales están implementados. Conectan bocas mediante transformaciones y enlaces recíprocos, muestran una vista de destino y permiten los tránsitos físicos admitidos. Algunas guías antiguas los describen como propuesta; el código y las pruebas actuales determinan qué existe.

Una boca puede ser raíz o estar alojada directamente en un vehículo conforme al contrato validado. Sus colisionadores pertenecen al cuerpo existente del vehículo. La vista del destino no implica un segundo mundo físico.

## Conexión y tránsito

El esquema establece forma, parentesco y reciprocidad. El paquete raíz exporta `createPortal`, `createPortalPair` y `createCarrierPortal`. Lee sus firmas antes de construir datos; no deduzcas campos a partir de una captura de pantalla.

El tránsito transforma posición, orientación y velocidad relativa pertinente. Si la boca está en un vehículo móvil, debe contemplarse el movimiento del anfitrión. Ocupación y espacio libre limitan los cruces y cambios de conexión. Tras teletransportar, la presentación debe reiniciar la interpolación para no barrer visualmente la distancia entre bocas.

## Pruebas prácticas

Empieza con las fábricas existentes y una escena estática sencilla. Valida una pareja recíproca con `parseScene` y atraviesa en ambos sentidos a pie. Repite con un vehículo tras comprobar que cabe en la abertura. Para bocas alojadas, prueba con el anfitrión en movimiento y con el jugador dentro.

```sh
npx vitest run test/simulation/placed-portals.test.ts
```

Al modificar mapeo o interiores móviles, revisa también la familia completa de pruebas. Una pareja estática correcta no demuestra funcionamiento de bocas móviles, salidas seguras o entorno remoto. Conserva el documento de autoría cuando cambias conexiones de ejecución, salvo que la aplicación guarde expresamente una edición.

**Fuentes:** `src/entity/portal/field.ts`, `src/entity/portal/portal.ts`, `src/simulation/portal-traversal.ts`, `src/simulation/portal-clearance.ts`, `src/render/portal/portals.ts` y `docs/portals.md`.

# 17. Renderizado y entorno visual

**Parte IV. Presentación y experiencia de usuario**

Three.js proporciona la infraestructura gráfica. El motor presenta entidades, terreno, cielo, agua, luces, sombras, equipo y efectos. El runtime de navegador compone estos servicios. Un anfitrión propio puede trabajar a menor nivel si asume renderizado y liberación de recursos.

## Selección de backend

WebGL es el valor predeterminado revisado. `createRenderBackend` acepta `webgl`, `webgpu` o `auto`. WebGPU se carga bajo demanda y vuelve a WebGL si no hay adaptador o falla la inicialización. El resultado registra `requested`, el `kind` real y, cuando procede, `fallbackReason`.

El anfitrión de referencia acepta `?renderer=webgpu` o `?renderer=auto`. Una solicitud no demuestra el backend utilizado. Compruébalo al medir y al informar de compatibilidad. Existen adaptadores y sustituciones de materiales; no supongas que un GLSL propio pasa sin cambios a WebGPU.

## Entorno y calidad

Geografía y cielo determinan el contexto ambiental. El terreno combina geometría, imágenes, carreteras, vegetación y otras capas según el contrato publicado. Mar visible, agua del terreno y nivel físico de agua son conceptos relacionados pero diferentes. Ocultar la superficie marina no redefine toda la flotación.

Sombras, espejos, posprocesado y escala de resolución pueden cambiar mucho el coste GPU. FSR 1 es escalado opcional de escritorio; XR inmersivo evita esa ruta. Utiliza perfiles de calidad coherentes y mide en el dispositivo objetivo antes de prometer una tasa de imágenes.

## Depuración

Si un objeto no aparece, revisa entidad validada, URL, capa visible, transformación, límites y soporte de material/backend. Para sombras defectuosas, compara configuración y luces antes de alterar colores. Para bloqueos gráficos, separa compilación de shaders y subida de texturas de la descarga de red. Los workers no eliminan todos esos costes.

Compara backends con la misma escena y calidad. Registra backend real, resolución y dispositivo con cualquier comparación visual.

**Fuentes:** `src/render/backend.ts`, `src/runtime/render-pipeline.ts`, `src/render/planet/world-environment.ts`, `src/render/effects/fsr1.ts` y `src/presentation/scene-view.ts`.

# 18. Cámaras y controles

Los dispositivos alimentan acciones lógicas. El runtime selecciona contexto: caminar, conducir, volar, manejar menús o interactuar en XR. Centraliza los bindings para mantener coherencia entre ayudas, controles táctiles y comportamiento real.

`GameInput` combina fuentes. Los perfiles de vehículo seleccionan superficies de control e interfaces táctiles. USB añade calibración y mapeo. El retorno de fuerza tiene una integración específica; detectar un dispositivo mediante Gamepad API no prueba que tenga feedback funcional.

## Cámaras

Según el contexto, hay primera persona, persecución, cabina, mapa y vistas cinematográficas. Suavizado y prevención de obstáculos son distintos de la posición física. No ajustes el campo de visión para ocultar una escala incorrecta del modelo o un anclaje de conductor mal situado.

`startCameras` permite una secuencia inicial. Los pasos pueden esperar tiempo o arranque del motor. Sus retardos usan milisegundos, mientras la física usa segundos. La introducción debe respetar la cancelación por entrada del usuario que implemente el runtime.

## Cambiar una asignación

Edita la acción lógica en `src/config/input-bindings.ts` y revisa la lista legible:

```sh
npm run controls:list
```

Prueba el contexto deseado y uno potencialmente conflictivo. Una tecla de arma a pie puede controlar otra función dentro de un vehículo. Codificar una tecla nueva directamente en un manejador aislado evita el contrato compartido.

En volantes y joysticks, calibra sentido, zona muerta y recorrido antes de ajustar fuerzas del vehículo. Prueba desconexión y pérdida de foco para no dejar entrada retenida. El anfitrión puede aportar `acceptsInput` cuando un editor o menú posee el foco.

En el HUD local de Euskadi, el botón de cámara se llama `CAM`, lleva icono de ojo y se alinea a la izquierda de FOV y Quality en el mismo bloque horizontal. El ajuste FOV muestra solo el número, conservando un nombre accesible descriptivo. Son instrucciones explícitas del repositorio.

**Fuentes:** `src/config/input-bindings.ts`, `src/runtime/input.ts`, `src/runtime/control-profiles.ts`, `src/runtime/game-camera.ts`, `docs/usb-controllers.md` y `tools/usb-ffb-bridge/README.md`.

# 19. Audio

El audio responde al juego y su presentación: régimen y carga del motor, neumáticos, marchas, impactos, armas y música. Separa el evento de la implementación sonora. Un sonido que no reproduce no debe impedir la acción física correspondiente.

El mezclador posee buses de ganancia por contexto. `AudioMixLevels` contiene `master`, `engine`, `music` y `musicMuted`. Aunque existe el nombre de bus `sfx`, el objeto público de mezcla no ofrece un deslizador `sfx` independiente: otros efectos alimentan la ruta principal. No diseñes una interfaz solo a partir del nombre de un tipo.

## Integración con navegador

La reproducción depende de interacción del usuario y estado del contexto. El runtime admite una preferencia inicial `audio`, `setAudioEnabled` y controles de mezcla. La música es una configuración del anfitrión y arranca mediante la ruta preparada para gestos del usuario.

Primero valida escena y controles con audio desactivado. Actívalo desde una acción deliberada y comprueba niveles. Si suena el motor pero no la música, revisa URL, silencio y ciclo de vida de la pista antes de modificar el contexto completo.

## Vehículos y sonido espacial

Hay voces para familias de motor, arranque, turbina, hélice, neumáticos y mecánica incidental. Recetas y telemetría seleccionan configuración. El sonido espacial sigue emisores y oyente; un error de conversión de marco puede separarlo aparentemente del vehículo.

Comprueba cualquier sonido en reposo, con telemetría variable, en distintas cámaras, en pausa y al eliminar su fuente. La liberación debe detener voces y conexiones propias. Montar repetidamente una escena no debe acumular motores o pistas duplicadas.

Los valores revisados son master 1, engine 1, music 0,3 y música sin silenciar. Son valores iniciales, no una calibración de volumen para todos los recursos.

**Fuentes:** `src/audio/mixer.ts`, `src/audio/graph.ts`, `src/audio/positional.ts`, `src/audio/vehicle-sound.ts`, `src/audio/music.ts` y `src/runtime/browser.ts`.

# 20. Interfaz, ajustes e idiomas

La interfaz combina HUD del navegador, paneles del juego de referencia y monitores dentro del mundo. El motor aporta composición y mensajes compartidos; el anfitrión aporta contenido y maquetación propios del producto.

## Menús y monitores

`MonitorMenu` funciona sin vehículo ni renderer. El ejemplo comprueba submenús y entrega de acciones:

```sh
npm run build
node examples/modularity/menu-only.mjs
```

La acción de menú describe intención; el anfitrión la aplica al propietario de estado apropiado. Los monitores por capas y HTML cubren distintos contextos. La telemetría debe leerse; los cambios del usuario pasan por acciones del runtime o aplicación, no por mutaciones arbitrarias del renderer.

## Propiedad y persistencia de ajustes

Un ajuste puede proceder de escena, valores predeterminados, opciones del runtime, anfitrión o preferencias guardadas. No hay una precedencia universal: inspecciona su resolución y lectura de almacenamiento. Algunos se aplican en vivo; otros, como calidad de recursos, requieren crear otro runtime.

PC, visor autónomo y visor conectado a PC separan preferencias. `installSettingsScope` selecciona el perfil por defecto para nuevas instancias sin modificar `localStorage`. Cada runtime conserva su propio `runtime.settings`; los controles deben usar ese almacén. Un `namespace` permite guardar preferencias independientes por instancia. Las claves PC `nabla.*` permanecen; los modos de visor usan `nabla.settings.<mode>.*`, evitando que un perfil sobrescriba otro.

Para un ajuste nuevo, documenta propietario, unidades, valor inicial, rango, clave, ámbito y necesidad de recarga. Prueba ausencia, valor inválido y valor guardado. No uses un parámetro URL sin documentar como único control de producto: los parámetros existentes de diagnóstico y fuente tienen funciones específicas.

## Idiomas y accesibilidad

Hay catálogos en inglés, español y euskera. El runtime admite `locale` y sobrescrituras de mensajes; inglés es el idioma de respaldo. Usa ese sistema en lugar de literales dispersos. Conserva navegación por teclado, nombres accesibles y foco visible.

Reutiliza tokens y estilos compartidos. La hoja generada tiene generador y comprobaciones; edita sus fuentes, no su salida. Mantén la disposición CAM/FOV de `AGENTS.md` en trabajos relacionados con Euskadi.

**Fuentes:** `src/runtime/messages.ts`, `src/i18n/index.ts`, `src/runtime/settings-scope.ts`, `src/render/monitors/menu.ts`, `src/ui/theme.ts`, `src/ui/styles/index.css` y `docs/ui-ux-pattern.md`.

# 21. Realidad virtual y aumentada

Los adaptadores XR conectan presentación y entrada inmersivas al comportamiento del motor. Las entradas públicas incluyen `/xr`, `/xr/ui`, `/ar` y adaptadores específicos de arco, canasta, colocación y armas. Importar AR no crea por sí solo una demo. Las capacidades se comprueban durante la ejecución.

`/headset.html` selecciona experiencias. Para dispositivos remotos, conserva un origen HTTPS de confianza. Un navegador en visor autónomo y uno de PC conectado a visor tienen rendimiento, entrada y preferencias distintos.

## Sesiones e interacción

`XRSessionController`, `GameXR` y `XRGameInput` integran sesión y controles. Manos, fuentes de mando, agarres y calibración tienen módulos dedicados. Conecta acciones lógicas al estado existente para que escritorio e inmersión compartan reglas de inventario y vehículos.

`inspectXRDevice` informa de lo observable en navegador y dispositivos. No identifica de forma infalible todos los transportes ni garantiza capacidades por una pista del user agent. Trata falta de seguimiento de manos, permisos denegados y fin de sesión como casos normales.

## Composición AR

AR expone habitación, vehículos a escala, control táctil e interacción. Su composición física no equivale simplemente a hacer transparente el fondo de un mundo de escritorio. Sigue el contrato de cada adaptador; no supongas que toda demo AR reutiliza sin cambios la sesión de escritorio.

En la primera prueba, elige el mundo de test, entra, calibra, realiza una interacción, sal y vuelve a entrar. Añade después geografía o recursos pesados. Valida escala y contacto antes de ajustar calidad visual.

Arco y canasta tienen simulación y envoltorios XR separados. Betaflight sigue siendo experimental y debe presentarse con sus límites actuales.

## Límites de verificación

Un typecheck de escritorio no valida estereoscopía, comodidad, mandos, passthrough ni tiempo de frame. Registra navegador, dispositivo, modo de sesión, calidad y backend real. El FSR de escritorio no demuestra una ruta equivalente de escalado en XR.

**Fuentes:** `src/runtime/xr/index.ts`, `src/runtime/ar/index.ts`, `src/runtime/xr-device-info.ts`, `docs/xr-module.md`, `docs/ar-module.md` y `game/headset.ts`.

# 22. Red y multijugador

La red aporta transporte, protocolo, sincronización, interpolación, entidades compartidas y ciertas decisiones de autoridad. El relay opcional agrupa jugadores en salas y distribuye estados y eventos. No ejecuta una simulación física autoritativa completa de todos los vehículos y personajes.

## Autoridad y presentación

`GameAuthority` unifica decisiones locales y mediante relay. `LocalAuthority` resuelve en el proceso. `RelayAuthority` envía solicitudes. La aplicación se suscribe a resultados y los aplica por la misma ruta, incluso para sus propias solicitudes. Así evita conceder un objeto de forma optimista y concederlo otra vez al recibir el resultado.

El ejemplo de contratos crea un objeto, se suscribe, lo solicita dos veces y verifica una única retirada. No prueba transporte. Las instantáneas remotas se interpolan para presentación; las reclamaciones compartidas deciden quién controla un vehículo. Efectos, munición, salud y geometría de impacto tienen fronteras distintas. «En red» no significa «verificado por servidor en todos sus aspectos».

## Qué hace el relay inspeccionado

Mantiene registros de salud por sala y maneja entidades y reclamaciones. Valida los datos de recarga, comprueba que un jugador conocido siga vivo y limita su frecuencia. Esto supera tanto la antigua descripción «no mantiene estado» como la afirmación de que recarga se reenvía sin validar.

En los impactos, el tirador informa y el servidor valida y aplica daño acotado a un objetivo presente. No es una comprobación geométrica del servidor de que el disparo intersectó realmente al objetivo. Documenta ese límite de confianza.

## Ejecución y pruebas

```sh
npm --prefix services/relay install
npm --prefix services/relay test
npm --prefix services/relay start
```

El puerto documentado por defecto es 10003; revisa los valores actuales del servidor al desplegar. Un juego HTTPS necesita `wss://`. La gestión de interés filtra por posición y radio; el radio del relay debe ser coherente con las distancias de aparición y ocultación del cliente.

Prueba dos clientes, reclamaciones, disputa por objetos, muerte/reaparición, desconexión/reconexión y limpieza de suscripciones.

**Fuentes:** `src/net/index.ts`, `src/net/authority.ts`, `src/net/authority-schema.ts`, `src/net/protocol.ts`, `services/relay/server.mjs` y `services/relay/server.test.mjs`.

# 23. Ampliar Nabla Engine

**Parte V. Ampliación, calidad y operación**

Elige el punto de extensión por responsabilidad. Una receta nueva, un adaptador, un comportamiento físico y un escenario particular son cambios distintos; no deben acabar todos dentro de `GameRuntime`.

| Cambio deseado              | Punto de partida                                    |
| --------------------------- | --------------------------------------------------- |
| Nuevos datos de entidad     | Esquema, validación y fábrica.                      |
| Modelo o ajuste de vehículo | Receta, catálogo, rig y adaptador.                  |
| Comportamiento físico       | Simulación o runtime independiente de familia.      |
| Efecto visible              | Presentación y vida útil de recursos.               |
| Acción de dispositivo       | Binding lógico y perfil de control.                 |
| Contenido regional o marca  | Conexiones del anfitrión.                           |
| Módulo público nuevo        | Exportación, declaraciones y ejemplo independiente. |

## Secuencia de implementación

Identifica al propietario existente y lee sus pruebas. Describe una acción concreta y un resultado observable. Define el contrato mínimo, con unidades y limpieza. Implementa en la capa adecuada y conecta después anfitrión o presentación.

Para una API pública, añade un ejemplo que solo importe rutas exportadas. Compila y ejecútalo contra el paquete construido. Antes de publicar, utiliza también el comprobador del paquete instalado. Un alias de Vite que funciona en el repositorio no demuestra que lo puedan usar los consumidores.

Para datos nuevos, rechaza combinaciones inválidas en la frontera. No reinterpretar silenciosamente masa, ruedas o escala de una escena guardada para ajustarla a valores recientes. Si hay migración intencionada, delimítala y pruébala. La migración específica de URL existentes no autoriza reescrituras generales.

## Evitar acoplamiento accidental

Mantén física independiente de objetos de navegador y coordenadas regionales fuera de valores genéricos. Libera escuchadores y recursos GPU/audio con su propietario. Conserva una autoridad para inventario, reclamaciones y física. Prefiere adaptadores configurados a condiciones por nombre visible.

El ejemplo `custom-prefab.mjs` amplía contenido usando fábricas existentes sin tocar física. Si puedes expresar una función así, no ensanches innecesariamente el contrato del motor.

Actualiza capítulo, referencias de configuración/formato e inventario de exportaciones. Registra el carácter experimental y las comprobaciones pendientes cuando corresponda.

**Fuentes:** `CONTRIBUTING.md`, `test/architecture/`, `package.json` y `scripts/check-package.mjs`.

# 24. Rendimiento y diagnóstico

Define una carga antes de optimizar. Registra mundo, número de vehículos, modo de compilación, navegador/dispositivo, backend real, resolución, calidad, workers y caché. Un suelo plano, un modelo local y una ciudad en streaming son cargas diferentes aunque compartan versión.

## Arranque y ejecución estable

El arranque incluye módulos, terreno, decodificación, física, recursos, instalación, shaders, texturas y condiciones de revelación del anfitrión. Que el contador de celdas se detenga durante preparación GPU no demuestra bloqueo de red. Corregir una etiqueta de progreso tampoco prueba que el arranque sea más rápido.

En ejecución hay costes de física, hilo principal, llamadas de dibujado, pasadas GPU, espejos, sombras, efectos y nuevo contenido. Bajar resolución ayuda a ciertas cargas GPU, pero no elimina JavaScript costoso ni creación de colisionadores. Los workers desplazan trabajo e introducen sincronización; no lo hacen gratuito.

## Investigación reproducible

1. Reproduce la misma escena y calidad en desarrollo y producción.
2. Separa ensayos de caché HTTP/IndexedDB fría y caliente.
3. Activa `?diagnostics=1`, `?perfLog=1` o `?performanceLog=1` según lo que necesites observar.
4. Inspecciona detalles, hitos y tiempos de arranque del canvas.
5. Cambia una variable, por ejemplo `physicsWorker=0` o `loadingWorkers=0`, conservando el resto.
6. Repite la carga original tras el cambio y comunica mediciones comparables.

El diagnóstico puede exponer `window.nablaRuntime` en el anfitrión de referencia. No diseñes integración de producción alrededor de ese global. `onDiagnostics` es un punto explícito de observación del runtime. El tiempo GPU depende de soporte de backend y dispositivo: ausencia de medición no significa coste cero.

## Presupuestos y corrección

Streaming, visibilidad, creación de colisiones, partículas y sombras tienen controles distintos. Reducir trabajo de colisión puede mejorar frames y retrasar suelo seguro. Conserva comportamiento al medir; no desactives prestaciones silenciosamente para mejorar una cifra.

**Fuentes:** `src/diagnostics/runtime-frame.ts`, `src/diagnostics/gpu-timing.ts`, `src/runtime/performance.ts`, `src/runtime/resolution-scale.ts`, `docs/game-runtime.md` y `docs/benchmarks/README.md`.

# 25. Pruebas y mantenimiento

La validación debe corresponder al cambio. Un esquema necesita datos válidos e inválidos; un vehículo, pruebas físicas; una interfaz o backend, recorridos de navegador; una exportación, un consumidor independiente. Aprobar una categoría no establece las demás.

## Comandos del repositorio

```sh
npm run build
npm run typecheck
npm test
npm run build:game
```

`npm run check` combina rigs, documentación generada, formato, biblioteca, tipos, pruebas y juego. Consulta su definición actual. Las regresiones de navegador son independientes:

```sh
npx playwright install chromium
npm run test:e2e
```

Utiliza la configuración Chromium y las fixtures del proyecto. Las respuestas simuladas verifican comportamiento, no que una celda remota exista hoy. Las comprobaciones de visor necesitan el dispositivo.

## Verificar el manual técnico

```sh
node scripts/check-manual.mjs
npm run build
node examples/manual/session.mjs
node examples/manual/contracts.mjs
npx tsc -p examples/manual/tsconfig.json
```

El verificador revisa enlaces locales, anclas, cobertura de capítulos e inventario público generado. No ejecuta comandos escritos en prosa, comprueba URL remotas ni demuestra exactitud semántica. Los ejemplos ejercitan contratos públicos y limpieza. El ejemplo de navegador se comprueba por tipos; eso no afirma que se haya renderizado una sesión.

## Evidencia honesta

Al actualizar un capítulo, sigue sus referencias e inspecciona comportamiento, no solo comentarios. Registra diferencias sin resolver. No declares todo el manual verificado porque sus enlaces funcionan.

Antes de publicar un paquete, revisa `npm pack --dry-run` y ejecuta `node scripts/check-package.mjs` según el flujo del proyecto. Conserva trabajo ajeno y evita formatear todo el repositorio sobre cambios de otra tarea. Para documentación, utiliza formato y comprobaciones acotadas.

**Fuentes:** `package.json`, `test/browser/README.md`, `scripts/check-manual.mjs` y `docs/manual/maintenance.md`.

# 26. Compilación, despliegue y servicios

Biblioteca y juego tienen salidas separadas. `npm run build` genera `dist/` y declaraciones. `npm run build:game` genera `game-dist/` con páginas y recursos finalizados. Desplegar una biblioteca no crea por sí solo una aplicación jugable.

## Compilar el juego

Si el terreno se sirve mediante `/tiles` en el mismo origen, en PowerShell:

```powershell
$env:VITE_NABLA_TILES_URL = '/tiles'
npm run build:game
```

Esto fija la ruta durante la compilación. No crea el proxy ni resuelve la discrepancia Atlas del capítulo 10. Sirve `game-dist/` preservando rutas, tipos de contenido y origen HTTPS.

## Proxy de producción

La correspondencia debe conservar el sufijo tras `/tiles/`. Un fragmento nginx ilustrativo es:

```nginx
location /tiles/ {
    proxy_pass https://atlas.chained.world/euskadi/terraform/;
    proxy_set_header Host atlas.chained.world;
    proxy_ssl_server_name on;
}
```

No es un despliegue completo: intégralo en el bloque adecuado y valídalo en tu infraestructura. Las barras finales afectan a la sustitución de URI. No envíes errores de recursos al HTML de una SPA, pues ocultarías el estado o error de esquema real. Prueba un objeto publicado usando su nombre exacto.

## Servicios auxiliares

La pila Compose es opcional para caché y generación. Consulta `compose.dev.yaml` y la guía de operaciones para volúmenes, rutas y comandos vigentes. Generar terreno no es lo mismo que consumirlo ya publicado.

En una publicación, primero deben estar disponibles todos los recursos inmutables y después cambiar los metadatos que los referencian. Utiliza el contrato real del publicador; no presupongas una entrada fija `manifest.json`.

El relay es un servicio Node separado. Publícalo por `wss://` para juegos HTTPS, comprueba `/health` y configura límites actuales de sala, frecuencia e interés. No sustituye el servidor de terreno ni de recursos.

## Validar una entrega

Prueba carga inicial, acceso directo a cada página, URL de recursos, workers, websocket seguro y errores. Registra versión y configuración. Conserva atribuciones. Una compilación estática correcta no demuestra compatibilidad con todos los servicios en vivo.

**Fuentes:** `vite.game.config.ts`, `scripts/finalize-game-assets.mjs`, `compose.dev.yaml`, `docs/world-cache-operations.md` y `services/relay/server.mjs`.

# Apéndice A. Entradas públicas del paquete

Este inventario se obtiene del mapa `exports` de `package.json` al generar el PDF. Enumera puntos de entrada, no todos los símbolos internos ni una promesa de estabilidad de cualquier archivo vecino. Las declaraciones TypeScript se producen mediante `npm run build`.

La entrada raíz reúne utilidades de escena, física y presentación y tiene un grafo amplio de dependencias. Prefiere una entrada específica cuando sea adecuada. Recuerda que `runtime/core` y `runtime/browser` exportan clases distintas llamadas `GameRuntime`.

En la tabla se muestra el sufijo que se añade a `@nabla/engine`; «raíz» significa la importación `@nabla/engine` sin sufijo. La segunda columna indica el archivo fuente que permite seguir sus exportaciones.

{{PUBLIC_API}}

## Buscar una API con seguridad

Selecciona la entrada pública, sigue sus exportaciones y lee la implementación del símbolo. Comprueba unidades, propiedad de estado, comportamiento asíncrono y limpieza. Compila un consumidor usando esa ruta pública y consulta los ejemplos para evidencia de integración. Un inventario exhaustivo de entradas no convierte un módulo experimental en una función lista para producción.

# Apéndice B. Referencia de configuración

La configuración se reparte por propietario y duración. Esta referencia remite a definiciones canónicas en lugar de copiar cientos de campos que pueden divergir. Lee tipos, normalizadores y resolución antes de crear un control visible.

| Área                          | Fuente canónica                    | Aplicación                               |
| ----------------------------- | ---------------------------------- | ---------------------------------------- |
| Física, gravedad y movimiento | `src/config/simulation.ts`         | Valores del motor y overrides admitidos. |
| Cámara                        | `src/config/camera.ts`             | Opciones `camera` y API de cámara.       |
| Asignaciones                  | `src/config/input-bindings.ts`     | Acciones compartidas.                    |
| Controles                     | `src/config/controls.ts`           | Consumidores de entrada.                 |
| Iluminación                   | `src/config/lighting.ts`           | Entorno y presentación.                  |
| Apariencia de vehículos       | `src/config/vehicle-appearance.ts` | Materiales y presentación compartidos.   |
| Streaming                     | `src/config/streaming.ts`          | Planificación del terreno.               |
| Rendimiento                   | `src/config/performance.ts`        | Presupuestos y perfiles.                 |
| Pantalla                      | `src/config/display.ts`            | Límite de frames y resolución.           |
| Jugabilidad/presentación      | `src/config/gameplay-tuning.ts`    | Armas, cámaras y efectos.                |
| Mezcla de audio               | `src/audio/mixer.ts`               | Mezcla y preferencias guardadas.         |
| Ámbito de ajustes             | `src/runtime/settings-scope.ts`    | Instalación previa a lecturas.           |

## Valores seleccionados de la revisión

| Ajuste                   | Valor    | Significado                           |
| ------------------------ | -------- | ------------------------------------- |
| `fixedStepSeconds`       | `1 / 60` | Paso físico en segundos.              |
| `maxSubsteps`            | `8`      | Máximo de pasos de recuperación.      |
| `maxFrameSeconds`        | `0.1`    | Límite de intervalo recibido.         |
| `gravity`                | `9.81`   | Aceleración en m/s².                  |
| `solverIterations`       | `15`     | Iteraciones del solver Rapier.        |
| Mezcla `master`          | `1`      | Ganancia principal.                   |
| Mezcla `engine`          | `1`      | Ganancia de motores.                  |
| Mezcla `music`           | `0.3`    | Ganancia de música.                   |
| Renderer sin preferencia | `webgl`  | Puede diferir del backend solicitado. |

Los cinco primeros campos pertenecen a `simulationDefaults`. El ejemplo de contratos verifica algunos para hacer visible un cambio. Si cambia una aserción, revisa también su explicación e implicaciones; no actualices solo el número esperado.

## Opciones del runtime de navegador

`canvas` y `scene` son obligatorios. La escena requiere geografía incluso sin conexión. `tiles` activa carga geográfica; `geography` por sí sola no. `startupTerrain` permite `spawn`, `nearby` o `area`.

`hud`, `audio`, `locale`, `messages`, `touchControls` y `acceptsInput` integran experiencia e interfaz. `onProgress`, `onFrame`, `onDiagnostics`, `onMessage` y `onError` permiten observar el runtime desde el anfitrión.

`clock` selecciona planificación automática o manual. `display` controla frames y resolución. `assetQuality` requiere un runtime nuevo. `backend` recibe un renderer preparado. `music`, `startCameras` y `startLights` configuran presentación. Consulta `GameRuntimeOptions` para tipos completos y duración de cada opción.

## Entorno y parámetros de diagnóstico

| Nombre                                           | Propietario y finalidad                               |
| ------------------------------------------------ | ----------------------------------------------------- |
| `NABLA_HTTPS_CERT`, `NABLA_HTTPS_KEY`            | Rutas HTTPS de Vite; deben aparecer juntas.           |
| `NABLA_TILES_UPSTREAM`                           | Origen del proxy de terreno en desarrollo.            |
| `NABLA_STUDIO_UPSTREAM`, `NABLA_CACHE_UPSTREAM`  | Proxies opcionales de servicios.                      |
| `VITE_NABLA_TILES_URL`                           | Ruta de terreno predeterminada en la compilación.     |
| `renderer=webgl/webgpu/auto`                     | Solicitud de backend del anfitrión.                   |
| `physicsWorker=0`                                | Comparación diagnóstica con física en hilo principal. |
| `loadingWorkers=0`                               | Comparación diagnóstica de carga.                     |
| `diagnostics=1`, `perfLog=1`, `performanceLog=1` | Rutas diferentes de instrumentación.                  |

No todos son opciones de la biblioteca npm. Las variables se leen en el código de servidor o compilación correspondiente y los parámetros URL en rutas concretas. No supongas que cualquier query configura cualquier módulo.

# Apéndice C. Referencia de formatos

## Documento de escena

`parseScene(unknown)` es el parser público. El esquema requiere versión 1, nombre no vacío y entidades. Son opcionales cursor, `cursorOnGround`, geografía, cielo y agua. Los esquemas estrictos rechazan campos desconocidos. Los límites exactos están en `src/scene/document.ts`.

| Estructura     | Regla principal                                                        |
| -------------- | ---------------------------------------------------------------------- |
| Geografía      | Latitud, longitud, altitud, `imagery`; `planetary` opcional.           |
| Cielo          | Discriminado por `mode`: `live` o `fixed`; el fijo usa fecha ISO `at`. |
| Agua           | `manual` o `tide`, con nivel y amplitud acotados.                      |
| Transformación | Posición y cuaternión unitario, sin escala arbitraria.                 |
| Padre          | ID estable o null; validación global de existencia y ciclos.           |
| Aparición      | Exactamente una y con restricciones de jerarquía física.               |

El límite habitual es 20.000 entidades. La opción experimental de escena grande no elimina presupuestos de recursos. Existe normalización específica de URL de recursos estándar.

## Vehículo y visual

`src/entity/vehicle/field.ts` define esquemas y `vehicle.ts` aporta valores iniciales y validación. Utiliza fábricas y recetas existentes en lugar de aproximar JSON a partir de prosa. El ejemplo compartido crea un vehículo completo sin GLB.

`visual` identifica recursos y transformaciones de importación. Masa, colisionadores, ruedas, suspensión y comportamiento deben quedar explícitos. Los adaptadores se eligen por ID y no por nombres visibles.

## Publicaciones geográficas

`PlanetManifest` del motor y `nabla-z15-package/1` de Atlas son contratos distintos. El adaptador combina un paquete referenciado con un manifiesto del motor; indicar su nombre en `manifestFiles` no basta para aceptar un paquete bruto. Z16 utiliza otra ruta.

Se admiten versiones de celda 1, 2, 3 y 4. La ausencia de versión se interpreta según el contrato. Tamaño y hash verifican identidad del recurso; la revisión geométrica identifica expectativas de generación. No sustituyas unas comprobaciones por otras. Consulta el capítulo 10 y `src/planet/contract.ts`, `atlas-z15.ts` y `atlas-z16.ts`.

## Mensajes de red

`src/net/protocol.ts` define representación transmitida. `authority-schema.ts` acota solicitudes lógicas. Utiliza sus codificadores y validadores. Un objeto compartido tiene ID de instancia, tipo, cantidad y posición; su identidad no es la etiqueta visible. Eventos de red y escenas guardadas son formatos diferentes.

# Apéndice D. Recetas y ejemplos completos

Ejecuta los comandos desde la raíz después de instalar dependencias y compilar. Los ejemplos importan API pública y comprueban contratos funcionales; no miden rendimiento de producción ni disponibilidad de servicios.

| Objetivo                       | Comando o archivo                               |
| ------------------------------ | ----------------------------------------------- |
| Escena de autoría validada     | `examples/manual/scene.mjs`                     |
| Conducción y ciclo de vida     | `node examples/manual/session.mjs`              |
| Datos, coordenadas y autoridad | `node examples/manual/contracts.mjs`            |
| Montaje de navegador           | `examples/manual/browser.ts`                    |
| Comprobar tipos de navegador   | `npx tsc -p examples/manual/tsconfig.json`      |
| Vehículo estándar sin renderer | `node examples/modularity/headless-vehicle.mjs` |
| Vehículo procedural            | `node examples/modularity/custom-prefab.mjs`    |
| Runtime de ruedas propio       | `node examples/modularity/wheeled-runtime.mjs`  |
| Barco y vuelo                  | `node examples/modularity/boat-flight.mjs`      |
| Menú independiente             | `node examples/modularity/menu-only.mjs`        |

## Añadir una caja dinámica

En `createManualScene`, crea un `box` con ID único, `motion: 'dynamic'`, masa, tamaño y posición sobre el suelo. Inclúyelo en `entities` antes de validar. Ejecuta la sesión, inspecciona su posición física y comprueba que la posición de autoría no cambia. Así distingues estado persistente y estado de partida.

## Empezar a pie

Sustituye `runtime.play({ vehicleId: 'manual-car' })` por `runtime.play()`. Conserva suelo y geografía: eliminar `tiles` y eliminar `geography` son operaciones distintas.

## Investigar una celda ausente

Lee URL y estado exactos. Revisa `/tiles/z/...` y el nombre hash publicado. Interpreta el 403 de Atlas según `AGENTS.md`. Después comprueba si el esquema coincide con el consumidor. El manifiesto estable existe en las celdas verificadas; sigue su puntero al paquete. No inventes hashes, índices ni una solución de autenticación.

## Añadir una exportación

Implementa el módulo, incluye sus declaraciones en la compilación, añade la entrada a `package.json` y crea un ejemplo independiente. Regenera el apéndice A técnico mediante `node scripts/check-manual.mjs --write-reference`. Ejecuta verificador, compilación y consumidor. Antes de publicar, comprueba el paquete instalado. Actualiza también el capítulo de comportamiento.

## Escena compartida

Los siguientes listados se incorporan directamente desde los ejemplos del repositorio para conservar las firmas y comandos comprobados. Sus comentarios originales pueden estar en inglés. La explicación que los acompaña está en español.

{{EXAMPLE_SCENE}}

## Sesión física y liberación

La sesión posee la simulación. El ejemplo verifica aceleración, pausa, conservación de datos y liberación. El reloj es explícito y usa segundos.

{{EXAMPLE_SESSION}}

## Validación, coordenadas y recogida única

Este programa comprueba errores de esquema, lectura geográfica, parámetros documentados y que dos solicitudes no conceden dos veces el mismo objeto.

{{EXAMPLE_CONTRACTS}}

## Integración de navegador

El anfitrión aporta un canvas dimensionado y llama a la función de limpieza al desmontar. Si falla el arranque, se libera el runtime antes de propagar el error.

{{EXAMPLE_BROWSER}}

# Apéndice E. Resolución de problemas

| Síntoma                               | Primera comprobación                                  | Interpretación                                         |
| ------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Puerto 5174 ocupado                   | Proceso y configuración HTTPS existentes.             | Vite usa puerto estricto; conserva el origen previsto. |
| Escena local exige coordenadas        | `scene.geography`.                                    | El runtime de navegador la requiere sin `tiles`.       |
| Coche visible que no conduce          | Definición, encendido, aparcamiento, entrada y pasos. | Visibilidad no demuestra estado físico válido.         |
| Importación rechazada                 | Versión, IDs, spawn, cuaternión y padres.             | Sintaxis JSON no basta.                                |
| Atlas devuelve 403                    | Ruta exacta, `z/` y nombre publicado.                 | En este origen, un objeto ausente produce 403.         |
| Se solicita `manifest.json`           | Ruta predeterminada del cargador.                     | Discrepancia conocida con publicación hash.            |
| Una celda devuelve HTML               | Proxy y fallback de SPA.                              | No interpretes la página de aplicación como metadatos. |
| Error CORS                            | Origen y proxy `/tiles`.                              | En esta integración Atlas necesita mismo origen.       |
| Terreno visible sin colisión          | Instalación física, marco y versión.                  | Presentación lista no significa física lista.          |
| Asfalto duplicado                     | Versión de celda y suelo unificado.                   | Evita superponer capas antiguas.                       |
| Contador de carga detenido            | Fase de preparación y revelación.                     | Puede estar trabajando la GPU.                         |
| WebGPU vuelve a WebGL                 | Backend real y `fallbackReason`.                      | El retorno está implementado.                          |
| Audio silencioso                      | Gesto, activación, mezcla y URL.                      | Separa contexto de fuente.                             |
| Visor sin conexión                    | Hostname, HTTPS fiable y modo.                        | Su localhost no es tu ordenador.                       |
| HTTPS no entra en sala                | `wss://` y salud del relay.                           | Comprueba transporte seguro.                           |
| Objeto concedido dos veces            | Mutación local y evento de autoridad.                 | Usa una única ruta de resultados.                      |
| Sonidos duplicados al volver          | Limpieza de runtime y suscripciones.                  | Revisa propiedad de recursos.                          |
| Importación solo funciona en checkout | Exports, declaraciones y paquete.                     | Los aliases pueden ocultar una API ausente.            |

## Informar de una incidencia

Incluye versión, commit y estado local relevante, URL de entrada, navegador/dispositivo, backend real, mundo, calidad, caché y pasos. Adjunta el primer error pertinente con URL y estado. Distingue esperado y observado. Para rendimiento, aporta mediciones comparables; para física, reduce la escena.

No borres ajustes o cachés antes de registrar las condiciones. Si necesitas comparar con caché limpia, conserva ambos ensayos. No cambies permisos de servicio para intentar corregir un objeto inexistente.

# Apéndice F. Glosario y mapa de fuentes

| Término                   | Significado en Nabla                                                |
| ------------------------- | ------------------------------------------------------------------- |
| Estado de autoría         | Datos que se desea conservar al margen de la partida.               |
| Estado de ejecución       | Posiciones, entrada, restricciones y datos mutables.                |
| Anfitrión o host          | Aplicación que compone servicios y contenido propio.                |
| Sesión                    | Propietario de una vida de simulación.                              |
| Runtime de navegador      | Composición completa con renderer, eventos y reloj.                 |
| Coordinador               | Runtime compartido de juego de menor nivel.                         |
| Entidad                   | Registro validado con identidad, transformación y cargas admitidas. |
| Preset                    | Definición o fábrica reutilizable de contenido concreto.            |
| Adaptador de presentación | Vincula convenciones de equipo a comportamiento visible.            |
| Rig                       | Información sobre piezas y anclajes de un modelo.                   |
| Instantánea o snapshot    | Muestra de estado físico o de red.                                  |
| Autoridad                 | Quien decide un resultado compartido y disputable.                  |
| Celda o tile              | Unidad geográfica identificada por zoom y coordenadas.              |
| Manifiesto                | Metadatos de un formato concreto; no un esquema universal.          |
| Versión de celda          | Versión de compatibilidad del contenido geográfico.                 |
| Revisión geométrica       | Identificador de expectativas de generación.                        |
| Revelación o reveal       | Paso desde preparación a juego visible.                             |
| Headless                  | Ejecución sin renderer ni interfaz de navegador.                    |
| XR                        | Integración de sesiones y entrada inmersivas de VR/AR.              |

## Localizar al propietario

| Pregunta                       | Archivo de partida                          |
| ------------------------------ | ------------------------------------------- |
| ¿Es una API instalable?        | `package.json` y apéndice A.                |
| ¿La escena es válida?          | `src/scene/document.ts`                     |
| ¿Qué admite una entidad?       | `src/entity/schema.ts`                      |
| ¿Quién controla play/stop?     | `src/runtime/session.ts`                    |
| ¿Quién planifica el navegador? | `src/runtime/browser.ts`                    |
| ¿Cómo avanza la física?        | `src/simulation/simulation.ts`              |
| ¿Cómo se solicita el terreno?  | `src/render/planet/static-tiles.ts`         |
| ¿Cómo se carga el mundo?       | `src/render/planet/world.ts`                |
| ¿Quién selecciona equipo?      | `src/catalog/presentation/road-vehicles.ts` |
| ¿Quién posee el arma llevada?  | `src/character/weapon-loadout.ts`           |
| ¿Quién concede un objeto?      | `src/net/authority.ts`                      |
| ¿Dónde se definen teclas?      | `src/config/input-bindings.ts`              |
| ¿Qué impone el relay?          | `services/relay/server.mjs`                 |
| ¿Dónde se compone la página?   | `game/main.ts`                              |

Utiliza `rg` para localizar definiciones y consumidores. Una página generada ayuda a navegar, pero implementación, exportación pública y pruebas aportan evidencias distintas. Lee las tres cuando cambies un contrato.

# Mantenimiento y registro de verificación

El manual técnico se mantiene en inglés en `docs/manual/`. Esta edición de lectura vive en `docs/manual/es/lectura.md`. La traducción de la prosa necesita revisión cuando cambia el original; regenerar el PDF solo recompone la maquetación, el inventario público y los listados incorporados.

## Procedimiento de actualización

1. Lee `AGENTS.md`, revisa el diff e identifica al propietario del estado.
2. Inspecciona implementación y pruebas. Separa contrato operativo previsto y comportamiento actual.
3. Actualiza capítulo y apéndices afectados en el manual técnico y revisa esta edición.
4. Ajusta ejemplos si cambia el contrato público, conservando importaciones públicas.
5. Regenera el inventario técnico con `node scripts/check-manual.mjs --write-reference`.
6. Ejecuta comprobación de manual, ejemplos y formato, además de pruebas apropiadas al cambio funcional.
7. Regenera el PDF, inspecciona páginas y registra qué se comprobó realmente.

## Qué revisar según el cambio

| Área modificada               | Partes del manual               |
| ----------------------------- | ------------------------------- |
| Exportaciones o compilación   | 2, 4, 25, 26 y apéndice A.      |
| Esquemas de escena/entidad    | 3, 7, 8, apéndice C y ejemplos. |
| Sesiones y workers            | 5, 6, 9 y 24.                   |
| Terreno y publicación         | 10, 24, 26 y apéndices C/E.     |
| Vehículos y rigs              | 11 a 13 y 18.                   |
| Personajes, armas y autoridad | 14, 15 y 22.                    |
| Presentación, audio, UI y XR  | 17 a 21 y apéndice B.           |
| Pruebas y diagnóstico         | 24, 25 y este registro.         |

## Correcciones de la primera revisión de mantenimiento

El 23 de octubre de 2026 se corrigieron los documentos de arquitectura, red e instrucciones operativas. El runtime de navegador posee renderer y recursos DOM; el núcleo de simulación conserva su uso sin navegador. La sesión limita el frame a 0,1 segundos y la simulación aplica su propio límite de ocho pasos. El relay mantiene estado de salud y entidades, y valida recargas.

Las consultas a Atlas confirmaron manifiestos estables y paquetes con hash en las dos celdas comprobadas. Las pruebas offline ejercitan el consumidor real con esas respuestas. El comentario del proxy ya no atribuye los 403 de objetos ausentes a falta de User-Agent. Se conserva la migración específica de URL antiguas de assets, sin prometer una migración general de esquemas.

El generador de luces del camión escribe nombres `nabla.light.*`; el lector conserva compatibilidad con los campos antiguos y los GLB distribuidos no se han reescrito. La propuesta de migración y sus condiciones están en `docs/maintenance-first-pass.md`.

La distinción entre escena plana y celda plana sigue vigente: la fixture geográfica y su circuito visual no equivalen al suelo de caja con colisión. Los ejemplos históricos de Studio pertenecen a su repositorio independiente.

## Comprobaciones del manual técnico original

El 23 de octubre de 2026, con Node.js 24.22.0 en Windows, pasaron la compilación de biblioteca, los ejemplos de sesión y contratos, el typecheck del ejemplo de navegador y los cinco programas de modularidad descritos. La sesión alcanzó aproximadamente 24,98 km/h, conservó la posición al pausar y no modificó los datos de autoría. Ese dato es una observación funcional, no una calibración del vehículo.

El verificador informó de 26 capítulos, 35 archivos Markdown comprobados, 363 enlaces locales y 66 entradas públicas. La referencia generada existente comprobó 625 módulos y 7.936 funciones. También pasó el formato acotado. Rapier emitió una advertencia de obsolescencia de inicialización ya existente, sin fallar las aserciones.

No se realizaron para esa tarea una sesión renderizada de navegador, pruebas de visor, consultas a Atlas en vivo ni benchmarks. No se afirmó cobertura de la suite completa de juego. Los cambios previos y concurrentes se conservaron; no se modificó jugabilidad ni se reinició el servidor por trabajo documental.

## Alcance de las comprobaciones

El verificador técnico comprueba enlaces locales, anclas, capítulos e inventario de exportaciones, pero no ejecuta comandos de la prosa ni verifica servicios remotos. La exactitud semántica requiere lectura de fuentes. La edición PDF añade comprobación de contenido extraído, navegación y revisión visual de maquetación; eso tampoco vuelve a validar por sí solo el comportamiento del motor.
