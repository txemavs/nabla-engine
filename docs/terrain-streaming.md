# Arranque progresivo y streaming de vuelo

El mismo `PlanetWorld` sirve a PC, XR y AR. La plataforma cambia la presentación y los
controles, no la simulación ni el planificador. No hay un segundo sistema de terreno para vuelo.

## Arranque

`GameRuntimeOptions.startupTerrain` acepta:

- `spawn` (por defecto): la fase inicial pide la celda Z15 que necesita cada comprobación
  de suelo. No pide el radio completo ni el corredor predictivo. Conserva las celdas fijadas.
  El jugador y los vehículos que se colocan explícitamente siguen esperando suelo real;
  no se sustituye por un plano ni se inicia tras un timeout sin terreno.
- `nearby`: espera la celda Z15 inicial y las tres vecinas más cercanas a la posición,
  medidas a sus bordes en Mercator. Euskadi Online usa este modo. La selección permanece
  fija durante las comprobaciones de suelo de las cuatro celdas; no vuelve a pedir todo
  el radio. Una celda inexistente produce un error, no una entrada con cobertura incompleta.
- `area`: comportamiento anterior, optativo para demostraciones finitas que necesiten cargar
  toda su cobertura antes de empezar.

`play()` mantiene el foco de arranque durante la preparación de audio, modelos y shaders y
las condiciones de la intro del host. `prepareReveal()` solo espera el suelo del jugador en
modo `spawn`; `waitForArea()` queda para `area`. Al mostrar el juego, el mismo streamer
recupera su radio y presupuesto normales y continúa en segundo plano. Cancelación y errores
restauran la política normal para que se pueda volver a iniciar.

La preparación de recursos, las físicas, el catálogo de vehículos, el combustible, el audio,
las colisiones y las preferencias de calidad no se han eliminado para acelerar la entrada.

## Vuelo

`GameplayStreaming` obtiene el modo de vuelo del estado vivo de la simulación y lo transmite
al mundo mediante `setStreamMode()`. Se mantiene la cadencia compartida de muestreo (500 ms),
con velocidad estimada desde posiciones de la simulación. No se usan las cámaras del casco
para predecir el movimiento del vehículo.

`planMapZooms()` admite una pirámide de mallas Z12 → Z13 → Z14 → Z15. La altura regula el
refinamiento cercano. El vector de velocidad y el anticipo del perfil añaden cobertura gruesa
por delante: con 30 segundos, 1.000 km/h equivalen a aproximadamente 8,3 km. La unión de
solicitudes reserva presupuesto para suelo obligatorio y corredor antes de refinar el resto.
La caché de celdas inactivas respeta el límite configurado, en lugar de conservar un tope fijo de 64.
Los actores protegidos y las celdas fijadas explícitamente pueden superar el presupuesto si
por sí solos lo exceden; no se retira su soporte físico para cumplir un contador.

En vuelo alto no se fuerza una descarga Z15 por cada celda sobrevolada. Cerca del suelo o al
prever un descenso hasta `streamingDefaults.flightFineHeight` (1.000 m sobre el terreno),
se vuelve a reservar el detalle local. En conducción el plan sigue siendo Z15.

Se reutiliza la sustitución atómica de coberturas: un padre disponible permanece hasta que
están listos todos los hijos necesarios para reemplazarlo. Si no hay ancestros publicados,
una celda fina ya disponible no desaparece por haber cambiado el plan de vuelo. Una respuesta
403/404 al padre anunciado activa la alternativa Z15 para esa zona y la caché negativa
existente evita pedir el mismo padre en cada actualización.

## Capacidad real del servidor

La declaración es `PlanetSourceOptions.meshMinZoom`:

```ts
tiles: {
  baseUrl: '/tiles',
  mode: 'static',
  meshMinZoom: 12, // Solo después de publicar la pirámide de mallas.
}
```

Los orígenes estáticos, incluidos los paquetes de Atlas, usan 15 por defecto. Los servicios
dinámicos conservan 13 por defecto. El juego acepta `meshMinZoom=12|13|14|15`; en un host con
consulta cerrada, como Euskadi Online, se configura en su `demo-config.ts`, no añadiéndolo a
una URL que el host elimina.

El 15 de octubre de 2026 se comprobaron tres padres de la zona de Zaisa, uno por nivel Z14,
Z13 y Z12, y los tres respondieron 403. Eso no demuestra la ausencia de todo el nivel en el
servidor; sí impide activar a ciegas esa pirámide para la zona comprobada. Esta implementación
no publica datos en Atlas ni promete una prueba de vuelo sobre mallas que aún no existen.

## Generación y publicación

Se amplía el generador existente, no se calculan LOD de GLBs grandes dentro del navegador.
El preparador y los límites de direcciones, cola, archivo, fotografías y entrega aceptan Z12.
`composeChildMeshes()` solo compone cuatro hijos completos y verificados, en el marco
geográfico del padre. Para paquetes Atlas verifica también el JSON y reutiliza
`adaptAtlasManifest()` y `planetTileGlbLayers()`: las celdas v2+ usan el terreno unificado
actual y conservan las capas de puentes admitidas por Engine, descartando la carretera OSM
separada según la misma política. Un checksum incorrecto aborta la composición; no se
sustituye silenciosamente por otra fuente. La simplificación conserva bordes y registra el error y las fuentes:

| Nivel | Proporción objetivo por etapa | Error objetivo de la etapa |
| ----- | ----------------------------- | -------------------------- |
| Z14   | 35 %                          | 1 m                        |
| Z13   | 18 %                          | 4 m                        |
| Z12   | 8 %                           | 12 m                       |

Son objetivos del simplificador, no garantías de tamaño de fichero. El error heredado de los
hijos se suma en el informe. Z15 no se modifica. Los registros conservan la revisión
`mesh-lod-v1`; publicar y habilitar esta pirámide en Atlas sigue siendo un paso separado.

## Verificación

Las pruebas cubren solicitud inicial de una celda, vuelta al streaming normal, vuelo a
1.000 km/h con presupuesto acotado, ausencia de Z15 forzado en altura, anticipación en
descenso, alternativa por padres ausentes, niveles mixtos, antimeridiano, conservación del
padre hasta completar los hijos y generación Z12 sin alterar Z15.

La comprobación de planificación no es una medición de FPS o de ancho de banda en un vuelo
real. Ese ensayo necesita publicar primero las mallas gruesas de la ruta.
