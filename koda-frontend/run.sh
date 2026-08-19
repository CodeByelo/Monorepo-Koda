#!/bin/bash

# Intentar ejecutar el script unificado de Python si está disponible
if command -v python3 &>/dev/null; then
    python3 run_servers.py
    exit 0
elif command -v python &>/dev/null; then
    python run_servers.py
    exit 0
fi

echo "[WARN] Python no está instalado o disponible en el PATH."
echo "[INFO] Intentando iniciar servicios en segundo plano..."

# Buscar entorno virtual local
PYTHON_EXE="python"
if [ -d ".venv" ]; then
    PYTHON_EXE=".venv/bin/python"
elif [ -d "venv" ]; then
    PYTHON_EXE="venv/bin/python"
elif [ -d "backend/.venv" ]; then
    PYTHON_EXE="backend/.venv/bin/python"
elif [ -d "backend/venv" ]; then
    PYTHON_EXE="backend/venv/bin/python"
fi

# Capturar señal de salida para detener los procesos en segundo plano
trap "kill 0" EXIT

echo "[OK] Iniciando Backend (FastAPI)..."
$PYTHON_EXE -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000 &

echo "[OK] Iniciando Frontend (Vite)..."
npm run dev &

# Esperar a que terminen todos los procesos
wait
