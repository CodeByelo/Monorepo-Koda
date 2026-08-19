@echo off
title Koda ERP Runner
echo ===================================================
echo   Iniciando Frontend y Backend para Koda ERP
echo ===================================================

:: Intentar ejecutar el script de Python unificado (que maneja prefijos y Ctrl+C limpiamente)
where python >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo [INFO] Iniciando servicios unificados con Python...
    python run_servers.py
    exit /b
)

echo [WARN] Python no se detecto en el PATH global o hubo un problema.
echo [INFO] Intentando inicio en ventanas separadas...

:: Intentar detectar un entorno virtual local de Python para ejecutar el Backend
set PYTHON_EXE=python
if exist .venv\Scripts\python.exe (
    set PYTHON_EXE=.venv\Scripts\python.exe
    echo [INFO] Entorno virtual detectado en: .venv
) else if exist venv\Scripts\python.exe (
    set PYTHON_EXE=venv\Scripts\python.exe
    echo [INFO] Entorno virtual detectado en: venv
) else if exist backend\.venv\Scripts\python.exe (
    set PYTHON_EXE=backend\.venv\Scripts\python.exe
    echo [INFO] Entorno virtual detectado en: backend\.venv
) else if exist backend\venv\Scripts\python.exe (
    set PYTHON_EXE=backend\venv\Scripts\python.exe
    echo [INFO] Entorno virtual detectado en: backend\venv
)

:: Iniciar Backend en una nueva ventana de comandos
echo [OK] Iniciando Backend (FastAPI) en una ventana separada...
start "Koda Backend (FastAPI)" cmd /k "%PYTHON_EXE% -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000"

:: Iniciar Frontend en la ventana actual
echo [OK] Iniciando Frontend (Vite)...
npm run dev
