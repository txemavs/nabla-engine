@echo off
setlocal
cd /d "%~dp0"
py -3 -m venv .venv
if errorlevel 1 goto error
.venv\Scripts\python.exe -m pip install -r requirements.txt pysdl2-dll pyinstaller
if errorlevel 1 goto error
.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --onefile --name Nabla-FFB --collect-all sdl2dll launcher.py
if errorlevel 1 goto error
echo Ejecutable disponible en dist\Nabla-FFB.exe
pause
exit /b 0
:error
 echo No se pudo generar el ejecutable.
 pause
 exit /b 1
