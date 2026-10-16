# Mandos USB, volantes, pedales y joysticks

Engine convierte dispositivos en las mismas entradas y acciones que usan los demás controles. La integración no crea otra simulación de coches o aviones. Implementación de [#224](https://github.com/txemavs/nabla-engine/issues/224), relacionada con el plan general [#206](https://github.com/txemavs/nabla-engine/issues/206).

## Uso en Euskadi Online

1. Conectar el dispositivo al **PC**, con sus drivers habituales, y abrir el juego en HTTPS o localhost. Pulsar un botón o mover un eje para que el navegador lo publique.
2. Abrir **Opciones → Dispositivos USB** y elegir uno de los tres asistentes: **Volante y pedales**, **Joystick / HOTAS para naves** o **Emisora para drones**.
3. Indicar qué piezas hay: pedales, embrague, levas, gases, timón, botón de cámara… Los componentes pueden ser dispositivos USB separados.
4. Seguir cada instrucción: reposo, movimiento hasta el extremo solicitado, extremo contrario si corresponde y vuelta al reposo. El asistente detecta el dispositivo y eje, mide extremos y deduce inversión sin pedir números de ejes. Rechaza ruido y movimientos ambiguos.
5. Probar los controles en la pantalla de revisión. **Guardar perfil** confirma los cambios; cancelar conserva la configuración anterior. Los controles no incluidos mantienen sus bindings previos.
6. Los perfiles de conducción, joystick/HOTAS y emisora se guardan por separado. Las tarjetas permiten activar el perfil de vuelo de joystick o de emisora sin recalibrar. El asistente de emisora asigna los cuatro canales lógicos por movimiento, independientemente de AETR/TAER o la disposición de palancas.
7. **Ajustes avanzados y diagnóstico**, cerrado por defecto, conserva la asignación por índice, calibración manual, curvas, importación/exportación JSON y feedback.
8. Al volver al juego, dejar las entradas en reposo para armarlas. Esto impide acelerar por un pedal ya pulsado al cambiar de ventana.

El asistente es reutilizable dentro de Engine (`UsbWizard` y `createUsbWizardPanel`). Tiene una captura por etapas y confirma el perfil mediante el mismo `UsbControllers.configure` que los ajustes manuales. Mientras está activo neutraliza la entrada USB; desactiva feedback al empezar. Las configuraciones anteriores en formato versión 1 siguen cargándose: se añade un perfil vacío de emisora y se conserva joystick como perfil de vuelo activo. El panel no cambia bindings por detectar un dispositivo.

Las plantillas **Volante genérico, HOTAS, AETR y TAER** son puntos de partida con índices orientativos, no certificaciones de modelos. Comprobar siempre los valores del navegador. En un eje de pedales combinados, asignar el mismo eje a acelerador y freno, con centro en reposo y recorridos limitados a cada mitad; por ejemplo, acelerador mínimo 0/máximo 1 y freno mínimo −1/máximo 0 con inversión. Los ejes independientes se calibran por separado.

El recorrido físico y el recorrido configurado para giro completo permiten ajustar sensibilidad y saturación del volante sin cambiar los parámetros del coche. Los ejes centrados tienen zona muerta, saturación de extremos y curva configurables; los pedales se normalizan a 0…1. Los gases de HOTAS/emisora mantienen el valor absoluto al soltar la palanca.

## API y propiedad

- `src/runtime/usb/controllers.ts`: perfiles validados, bindings, normalización, plantillas, varios dispositivos, acciones semánticas, flancos y rearme en reposo.
- `src/runtime/usb/wizard.ts` y `wizard-panel.ts`: asistentes guiados, detección por movimiento, medición de extremos, revisión y guardado explícito.
- `src/runtime/usb/settings-panel.ts`: panel reutilizable con diagnóstico, asignación, calibración, importación/exportación y configuración de feedback.
- `src/runtime/usb/feedback.ts`: vibración y adaptador al puente de fuerza opcional.
- `src/runtime/input.ts`: mezcla de entradas USB con teclado, gamepad estándar y controles táctiles/monitores.
- `src/runtime/browser.ts`: detección de dispositivos, aplicación de acciones, vida útil y conexión al vehículo activo.
- `src/simulation/contracts.ts`, `simulation.ts` y `vehicles/wheeled/`: freno de servicio proporcional, embrague, selección directa del cambio H y señales de contacto para feedback.

Exportación pública: `@nabla/engine/runtime`. Ejemplo para un host que usa `GameRuntime`:

```ts
import { createUsbSettingsPanel } from '@nabla/engine/runtime'

const panel = createUsbSettingsPanel(runtime.usbControllers, runtime.usbFeedback)
container.append(panel.root)
// Al desmontar el host:
panel.dispose()
```

El host puede pasar `usb: { storage }` al runtime, con `getItem`/`setItem`, o `storage: null` para desactivar persistencia. Por defecto se usa localStorage con `nabla.usb.controllers.v1`. No se sobrescribe un perfil corrupto silenciosamente. La importación valida versión, acciones, índices, límites, curvas y recorridos antes de reemplazar el perfil activo.

Otros hosts pueden consumir `UsbControllers.read(pads, context, enabled)` y entregar el resultado como `GameInputSources.usb`, usando su propia política de foco. Deben llamar `reset()` al perder foco y `UsbFeedback.stop()` al suspender. El panel no llama a física ni genera eventos de teclado.

## Reglas de mezcla y desconexión

- Los mandos estándar sin bindings conservan el adaptador estándar existente.
- Un dispositivo con bindings usa su perfil en lugar del mapeo estándar, evitando doble entrada.
- Cada binding identifica dispositivo por ID y capacidades, no por el índice transitorio del puerto. La configuración vive en el navegador/origen que se calibró; importar en otro sistema puede requerir reasignación.
- Pueden participar varios dispositivos diferentes. Para un mismo eje se toma la mayor entrada absoluta, sin sumar aceleradores. Entre USB y los controles existentes también prevalece la entrada de mayor magnitud.
- Dos dispositivos con ID y capacidades idénticos se consideran ambiguos: se neutralizan sus bindings. La interfaz de reasociación por unidad física idéntica todavía necesita una identidad que el navegador permita distinguir; no se elige uno al azar.
- Cambiar de contexto, perder foco o desconectar exige volver a reposo antes de activar las entradas afectadas. Abrir configuración no mueve el vehículo.
- No se garantiza acceso a todo dispositivo USB: depende de lo que el navegador exponga como Gamepad y del driver. La ausencia de force feedback no impide usar la entrada.

## Vehículos y transmisión

`PlayerInput.serviceBrake` es independiente del freno de mano y aplica el freno de servicio proporcional a las cuatro ruedas. En motos se emplea el freno delantero existente. Los valores del embrague reducen el par transmitido y la retención. Esta ampliación no simula un embrague térmico ni calados del motor.

El cambio secuencial reutiliza las acciones `gear.up` y `gear.down`. El cambio H asigna botones a `gear.selectR`, `gear.selectN` y `gear.select1`…`gear.select8`; al soltar todas las posiciones vuelve a N. Se mantienen las protecciones de dirección y sobre-régimen del drivetrain. Un vehículo sin transmisión compatible no adquiere marchas por asignarle botones.

## Vibración y fuerza real

El feedback está apagado por defecto. La vibración consulta capacidades de Gamepad y usa deslizamiento de neumáticos y cambios de carga de suspensión. Los errores de un actuador no deben parar el juego.

La fuerza direccional real requiere el **puente SDL2 experimental** de `tools/usb-ffb-bridge`. La Gamepad API no ofrece este control. Se ha elegido un adaptador local genérico antes que enviar informes WebHID de fabricante sin disponer del protocolo y del hardware para verificarlos.

La simulación expone `vehicleFeedback(id)`: fuerza de alineación aproximada a partir de los impulsos laterales de las ruedas directrices de Rapier, trail neumático de 6 cm y reducción de dirección 15:1, carga de suspensión normalizada, deslizamiento y contacto. Es una aproximación del par de dirección, no una simulación certificada de la columna. No añade oscilaciones de motor arbitrarias.

El adaptador limita, suaviza y envía como máximo unas 30 actualizaciones/s. La fuerza se limita inicialmente al 20 % en el juego y al 30 % en el puente. Se detiene por pérdida de foco/visibilidad, salida del vehículo, pausa de entrada y desconexión. El puente añade un watchdog independiente de 150 ms y efectos de 200 ms como máximo. Consultar su README para instalación, permisos de origen y token.

### Estado de validación

| Combinación                           | Estado                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------- |
| Mapeo estándar existente              | Cubierto por regresiones automatizadas                                 |
| Volante/pedales no estándar simulados | Pruebas de perfiles, navegador y runtime                               |
| HOTAS/emisora simulados               | Normalización, perfiles de vuelo y gases absolutos                     |
| Protocolo del puente FFB              | Pruebas de autenticación, límites y watchdog                           |
| Logitech físico del usuario           | Pendiente de identificar modelo y probar conectado                     |
| FFB real en volante                   | Experimental; pendiente de validación física, incluidos signo y parada |
| Dos dispositivos físicos idénticos    | Se neutralizan si el navegador no permite distinguirlos                |

Las pruebas con dispositivos simulados no acreditan compatibilidad física. Usar «Informe de dispositivos» para registrar modelo/ID, navegador, SO, ejes, botones, calibración y resultados de la prueba real. No prometer fuerza universal ni activarla automáticamente.

## Referencias de las APIs

- [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)
- [WebHID](https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API)
- [SDL2 HapticUpdateEffect](https://wiki.libsdl.org/SDL2/SDL_HapticUpdateEffect)
- [SDL2 HAPTIC_STEERING_AXIS](https://wiki.libsdl.org/SDL2/SDL_HAPTIC_STEERING_AXIS)
