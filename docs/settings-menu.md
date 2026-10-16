# Menú de juego a pantalla completa

El reloj de Euskadi Online abre el monitor HTML definido en `game/settings-hud.ts`.
Mientras está abierto, el mismo botón muestra una flecha hacia abajo para recoger el monitor.
Es el único botón de cierre; también se puede pulsar Escape. Ambos devuelven el foco al juego.
El estilo utiliza las variables y controles de `src/runtime/interface-theme.ts`, compartidos
con los monitores del mundo. La implementación es para la interfaz de escritorio: no cambia
los menús de los monitores XR/AR ni los parámetros de simulación.

## Navegación

Las pestañas superiores son Mundo, Opciones, Objetos y Desarrollo. Cada pestaña tiene una
navegación izquierda y una única sección visible a la derecha. Se conserva la última sección
seleccionada de cada pestaña. Armas agrupa Apuntado, Posturas y animaciones, y Fogonazo.

Los controles originales se trasladan dentro del mismo documento. No se clonan ni se vuelven
a vincular: conservan sus eventos, métodos del runtime, almacenamiento y referencias desde
los módulos que los actualizan. La observación del menú antiguo incorpora también secciones
registradas después del montaje. El panel antiguo permanece oculto; su estado `open` sigue
la apertura del monitor para conservar las actualizaciones de caché y calidad.

`game/settings-controls.ts` genera Teclas desde `inputBindings`, `controlsFor`, `keyLabel` e
`inputChords` de Engine. No lee una copia manual de la lista. Permite buscar y filtrar por
contexto. La navegación de pestañas normaliza sus teclas en el catálogo de entrada.

## Mapa: estados reales y extensión variable

`GameRuntime.terrainTiles` expone una instantánea de los estados de las teselas de malla del
streamer existente (`PlanetWorld.diagnostics`). Es una consulta: no solicita mapas ni modifica
su cobertura, caché, memoria o física.

`game/settings-map.ts` calcula la extensión de todas las teselas conocidas, incluidas las
cargadas, visibles, planificadas, en descarga, instalación o reintento. Normaliza los niveles
de zoom a una cuadrícula común y crea un elemento por tesela, sin rellenar celdas vacías ni
imponer una rejilla de 5×5. La vista se actualiza una vez por segundo solamente si está visible;
no reconstruye sus elementos cuando no han cambiado los estados.

Esta fase muestra coordenadas y estados. Las miniaturas de las texturas de cada paquete
quedan pendientes de incorporar; todavía no se solicitan imágenes adicionales.

## Comprobación

- `test/browser/e2e/settings-hud.spec.ts`: montaje, registros tardíos, conservación de eventos,
  navegación, teclas, mapa, pantalla completa, tamaño móvil y cierre.
- `test/game/settings-map.test.ts`: extensión variable, mezcla de zooms y escena sin teselas.

## Arranque de la integración local de Euskadi Online

La copia de integración se sirve con `EUSKADI_BOOT=attract`, igual que producción.
La intro del host utiliza el evento `planet-ready` derivado de `data-boot-mode` para
terminar sus créditos y liberar `holdReveal`. Cambiar solamente el servidor a
`EUSKADI_BOOT=classic` desactiva la vista orbital que emite ese evento: la intro espera
al juego y el juego espera a la intro, dejando una pantalla negra. No utilizar ese
cambio de configuración para probar el menú; no es un fallo de la navegación nueva.

## Organización de Opciones y copias de ajustes

La navegación de Opciones agrupa por tarea:

- **Cámara**: vista, efectos de cámara y Action Cam dentro de la misma pantalla.
- **Controles**: Conducción, Teclas y Dispositivos USB (con sus asistentes).
- **Gráficos**: Calidad y resolución, Sombras, Suelo y texturas y Efectos.
- **Sonido**: mezcla de volúmenes cuando el host proporciona el mezclador.
- **Gestión de ajustes**: guardar un JSON, importar con revisión previa y restablecer valores predeterminados.

No hay un botón de borrado global en el pie del menú. Restablecer abre una confirmación y exige marcar la comprensión del cambio antes de habilitar la acción final. Por defecto conserva las calibraciones de mandos USB y casco; una casilla explícita permite incluirlas. El restablecimiento también retira las opciones gráficas de la URL para que no impidan volver a los valores iniciales.

`src/runtime/settings-backup.ts` contiene el catálogo reutilizable de preferencias y el formato `nabla-settings` versión 1. Incluye las claves admitidas de localStorage/sessionStorage y opciones de pantalla de la URL. No copia escenas, mapas/cachés, informes de seguimiento, credenciales ni el resto del almacenamiento del origen.

La selección de archivo solo valida y presenta un resumen; no cambia datos. Importar combina los ajustes presentes en el JSON con los actuales, salvo que el usuario seleccione reemplazo completo. Se conserva la URL del mundo y sus coordenadas. Se valida el perfil USB antes de escribir y se intenta restaurar ambos almacenes si falla una escritura. La aplicación de un archivo y el restablecimiento recargan la página para que cada módulo lea su configuración con su propia validación.

Pruebas: `settings-backup.test.ts`, `settings-management.spec.ts` y `settings-hud.spec.ts` verifican límites del archivo, exclusión de datos ajenos, reversión de escrituras fallidas, confirmación, calibraciones conservadas, navegación y conservación de listeners de los controles originales.
