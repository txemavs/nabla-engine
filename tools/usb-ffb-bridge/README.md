# Puente experimental de fuerza para volante USB

La entrada de volantes, pedales y joysticks **no necesita este programa**. Este puente opcional solo permite enviar fuerza direccional real a un volante que SDL2 y su driver expongan como dispositivo háptico con efecto constante.

**No se ha validado todavía con el Logitech físico del usuario.** Los tests del protocolo no verifican el driver ni el signo de la fuerza. No activar fuerza alta antes de comprobar dirección, magnitud y parada con el modelo real.

## Preparación en el PC del volante

Python 3.11 o posterior, SDL2 y driver del fabricante. Instalar en un entorno virtual:

```sh
python -m venv .venv
# Activar el entorno según el sistema operativo.
python -m pip install -r requirements.txt
python bridge.py --list
```

PySDL2 necesita la biblioteca nativa SDL2. En Linux instalar SDL2 mediante el gestor del sistema; en Windows proporcionar SDL2.dll mediante las instrucciones de [PySDL2](https://pysdl2.readthedocs.io/en/latest/install.html). El programa falla explícitamente si no encuentra la biblioteca o si no se admite fuerza constante; no sustituye esto por vibración.

Elegir el índice que muestra `--list` y permitir únicamente el origen exacto desde el que se ejecuta el juego:

```sh
python bridge.py --device 0 --origin https://euskadi.online
# Ejemplo local, añadir los orígenes que realmente se utilicen:
python bridge.py --device 0 --origin https://10.10.10.80:5193 --origin http://localhost:5195
```

El puente escucha solo en `127.0.0.1:9876`. Imprime un token aleatorio válido durante ese proceso. En **Opciones → Dispositivos USB → Vibración y force feedback**, introducir URL y token, conectar y activar feedback. El token no se guarda en los perfiles.

La política de acceso a loopback puede variar con el navegador. Si HTTPS bloquea `ws://127.0.0.1:9876`, usar WSS con un certificado local confiado para localhost/127.0.0.1:

```sh
python bridge.py --device 0 --origin https://euskadi.online --cert cert.pem --key key.pem
```

Entonces usar `wss://127.0.0.1:9876`. No desactivar la seguridad del navegador para evitar el bloqueo.

## Límites y ciclo de vida

- Origen exacto obligatorio, autenticación antes de aceptar fuerza y un único cliente propietario.
- Mensajes JSON de hasta 1024 bytes y cola limitada. No se acepta fuerza no finita, texto ni booleanos.
- Intensidad máxima del puente: 30 % por defecto. Ajustable mediante `--max-force 0…1`; el límite del juego se aplica por separado.
- Sin mensajes durante 150 ms: detener efectos. Cada efecto dura 200 ms como máximo, incluso si se interrumpe el proceso.
- Cierre, error de protocolo, pérdida de dispositivo y Ctrl+C detienen los efectos y liberan el dispositivo.
- La página también detiene salida y desactiva feedback al perder foco de ventana. El watchdog del puente funciona aunque la página deje de ejecutar JavaScript.
- No se descargan protocolos de fabricante ni se abren dispositivos arbitrarios desde la web. La elección de volante se realiza localmente con `--device`.

## Pruebas sin hardware

```sh
python -m unittest discover -s . -p 'test_*.py'
```

Estas pruebas no requieren SDL2. Para validar hardware: anotar modelo, SO, driver, capacidades SDL2 y navegador; empezar con fuerza baja, comprobar el signo de la fuerza en ambos sentidos y verificar parada al cerrar pestaña, cambiar de ventana, desconectar el volante y detener el puente. Verificar que el driver no añade un autocentrado propio que interfiera con el efecto.

## Ejecutable de Windows

Ejecutar `build-windows.cmd` en Windows con Python instalado para generar
`dist/Nabla-FFB.exe` (incluye Python y SDL2). Copiar ese ejecutable al PC del
volante y abrirlo con doble clic; no necesita Python instalado en destino.
El lanzador muestra dispositivos, pide su índice y arranca el puente con un
límite del 20 %. Permite los orígenes HTTPS de euskadi.online (con y sin www),
localhost:5193 y 10.10.10.80:5193. Muestra el token de sesión en la consola.
Cerrar el programa o Ctrl+C detiene el puente. La versión de consola avanzada
sigue disponible para configurar otros orígenes o TLS.

La enumeración del Driving Force GT se ha verificado en Windows con el
ejecutable; falta validar fuerzas y conexión desde el navegador con ese hardware.
