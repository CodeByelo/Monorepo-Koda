@echo off
setlocal
echo ===================================================
echo   Setup y Ejecucion del Backend (Python)
echo ===================================================

REM 1. Deteccion de Python (Metodo Robusto)
set PYTHON_CMD=python
python --version >nul 2>&1
if %errorlevel% equ 0 goto python_found

set PYTHON_CMD=py
py --version >nul 2>&1
if %errorlevel% equ 0 goto python_found

echo [ERROR] Python no se detecto en el sistema.
pause
exit /b 1

:python_found
echo [INFO] Usando: %PYTHON_CMD%

REM 2. Verificacion y Creacion de Entorno Virtual en la carpeta BACKEND
if not exist "backend\venv" goto create_venv
"backend\venv\Scripts\python.exe" --version >nul 2>&1
if %errorlevel% equ 0 goto venv_ok

echo [AVISO] Entorno virtual invalido. Recreando...
rmdir /s /q "backend\venv"

:create_venv
echo [INFO] Creando entorno virtual en backend\venv...
%PYTHON_CMD% -m venv backend\venv
if %errorlevel% neq 0 (
    echo [ERROR] No se pudo crear el entorno virtual.
    pause
    exit /b 1
)

:venv_ok
REM 3. Instalacion de dependencias
echo [INFO] Instalando dependencias...
"backend\venv\Scripts\python.exe" -m pip install --upgrade pip
"backend\venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Fallo al instalar dependencias.
    pause
    exit /b 1
)

REM 4. Iniciar servidor
echo.
echo [INFO] Iniciando servidor en http://localhost:8000
echo.

REM ✅ CORRECCIÓN CLAVE:
REM Ejecutamos uvicorn desde la RAÍZ del proyecto (donde estamos ahora)
REM Apuntando al módulo 'backend.main' correctamente.
"backend\venv\Scripts\python.exe" -m uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

if %errorlevel% neq 0 (
    echo [ERROR] El servidor fallo al iniciar.
    pause
)