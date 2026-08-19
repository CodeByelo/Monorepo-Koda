@echo off
echo ===================================================
echo   Iniciando Sistema Alpha V.0.2 - PROJECT REAL
echo ===================================================

echo [1/2] Iniciando Backend Enterprise (FastAPI)...
:: Ejecutamos run_backend.bat que ya gestiona el entorno virtual
start "ALPHA BACKEND" run_backend.bat

echo [2/2] Iniciando Frontend Oficial (Next.js)...
cd frontend
:: Abrimos el frontend en una nueva ventana entrando a su carpeta
start "ALPHA FRONTEND" cmd /k "npm run dev"
cd ..

echo.
echo ===================================================
echo   Sistemas iniciados correctamente.
echo   - Backend: http://localhost:8000
echo   - Frontend: http://localhost:3000

echo ----------------- JJD -----------------------------

echo ===================================================
echo [INFO] Espera unos segundos a que Next.js compile...
pause