import sys
import traceback
import bridge

def main():
    print('Nabla — Force feedback local\n')
    sys.argv = [sys.argv[0], '--list']
    bridge.main()
    device = input('\nNumero del volante (Enter para cancelar): ').strip()
    if not device:
        return
    if not device.isdecimal():
        raise ValueError('Introduce el numero mostrado junto al volante.')
    print('\nCopia el token que aparezca en el juego y pulsa Conectar puente FFB.')
    print('Deja esta ventana abierta. Ctrl+C detiene el puente.\n')
    sys.argv = [sys.argv[0], '--device', device, '--max-force', '0.2',
                '--origin', 'https://euskadi.online', '--origin', 'https://www.euskadi.online',
                '--origin', 'https://localhost:5193', '--origin', 'https://10.10.10.80:5193']
    bridge.main()

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception:
        traceback.print_exc()
    finally:
        input('\nPuente detenido. Pulsa Enter para cerrar.')
