import os
import sys
import subprocess
import threading
import time

def check_env_file():
    """Valida la presencia de .env y DATABASE_URL antes de arrancar los servicios."""
    env_path = ".env"
    if not os.path.exists(env_path):
        print("\033[91m[SYSTEM] Error crítico: Archivo .env no encontrado.\033[0m")
        sys.exit(1)
        
    has_db_url = False
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip().startswith("DATABASE_URL="):
                has_db_url = True
                break
                
    if not has_db_url:
        print("\033[91m[SYSTEM] Error crítico: DATABASE_URL no definida en .env. Se requiere conexión a Supabase.\033[0m")
        sys.exit(1)


def find_python_executable():
    """
    Busca si existe un entorno virtual de Python (.venv o venv)
    en la raíz o en la carpeta backend para ejecutar uvicorn.
    """
    possible_dirs = [
        ".venv",
        "venv",
        os.path.join("backend", ".venv"),
        os.path.join("backend", "venv")
    ]
    for venv_dir in possible_dirs:
        if os.name == 'nt':
            python_path = os.path.join(venv_dir, "Scripts", "python.exe")
        else:
            python_path = os.path.join(venv_dir, "bin", "python")
        if os.path.exists(python_path):
            return python_path
    return sys.executable

def stream_output(process, prefix, color_code):
    """
    Lee la salida del proceso línea por línea y la imprime con un prefijo coloreado.
    """
    reset_code = "\033[0m"
    try:
        for line in iter(process.stdout.readline, ''):
            cleaned_line = line.strip('\r\n')
            print(f"{color_code}{prefix}{reset_code} {cleaned_line}")
    except Exception as e:
        print(f"\033[91m[SYSTEM] Error leyendo salida de {prefix}: {e}\033[0m")
    finally:
        process.stdout.close()

def kill_process_on_port(port):
    """
    Busca y mata cualquier proceso ocupando el puerto dado (Windows y Linux/macOS)
    para liberar el puerto antes de levantar los servicios.
    """
    try:
        if os.name == 'nt':
            # En Windows: buscar PID usando netstat y filtrando por LISTENING
            cmd = f"netstat -ano | findstr :{port}"
            output = subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL)
            pids = set()
            for line in output.strip().split('\n'):
                parts = line.split()
                if len(parts) >= 5 and "LISTENING" in parts:
                    pid = parts[-1]
                    if pid.isdigit() and int(pid) > 0:
                        pids.add(pid)
            
            for pid in pids:
                print(f"\033[93m[SYSTEM] Puerto {port} ocupado por PID {pid}. Liberando puerto...\033[0m")
                subprocess.run(f"taskkill /F /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            # En Linux/macOS: buscar PID usando lsof
            cmd = f"lsof -t -i:{port}"
            output = subprocess.check_output(cmd, shell=True, text=True, stderr=subprocess.DEVNULL)
            pids = output.strip().split('\n')
            for pid in pids:
                if pid.isdigit():
                    print(f"\033[93m[SYSTEM] Puerto {port} ocupado por PID {pid}. Liberando puerto...\033[0m")
                    subprocess.run(f"kill -9 {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except subprocess.CalledProcessError:
        pass
    except Exception as e:
        print(f"\033[91m[SYSTEM] Error al intentar liberar el puerto {port}: {e}\033[0m")

def main():
    # Habilitar soporte de colores ANSI en la terminal de Windows
    if os.name == 'nt':
        os.system('')

    # Validar entorno antes de intentar arrancar nada
    print("\033[95m[SYSTEM] Verificando entorno...\033[0m")
    check_env_file()

    # Puertos del Backend y Frontend
    BACKEND_PORT = 8000
    FRONTEND_PORT = 5173

    print("\033[95m===================================================\033[0m")
    print("\033[95m   Iniciando Frontend (Vite) y Backend (FastAPI)   \033[0m")
    print("\033[95m===================================================\033[0m")
    
    # Liberar puertos antes de levantar los servicios
    print("\033[95m[SYSTEM] Verificando y liberando puertos...\033[0m")
    kill_process_on_port(BACKEND_PORT)
    kill_process_on_port(FRONTEND_PORT)

    python_exe = find_python_executable()
    print(f"\033[95m[SYSTEM] Python detectado: {python_exe}\033[0m\n")

    # Definir comandos
    backend_cmd = [
        python_exe, "-m", "uvicorn", "backend.main:app",
        "--reload", "--host", "127.0.0.1", "--port", str(BACKEND_PORT)
    ]
    frontend_cmd = ["npm", "run", "dev"]
    
    # En Windows npm se ejecuta como npm.cmd
    if os.name == 'nt':
        frontend_cmd[0] = "npm.cmd"

    # Iniciar procesos
    try:
        backend_proc = subprocess.Popen(
            backend_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding='utf-8',
            errors='replace'
        )
    except Exception as e:
        print(f"\033[91m[SYSTEM] Error iniciando Backend: {e}\033[0m")
        sys.exit(1)

    try:
        frontend_proc = subprocess.Popen(
            frontend_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            encoding='utf-8',
            errors='replace'
        )
    except Exception as e:
        print(f"\033[91m[SYSTEM] Error iniciando Frontend: {e}\033[0m")
        backend_proc.terminate()
        sys.exit(1)

    # Crear hilos para manejar la consola de forma no bloqueante
    # Cyan para backend, Verde para frontend
    backend_thread = threading.Thread(
        target=stream_output,
        args=(backend_proc, "[BACKEND]", "\033[36m")
    )
    frontend_thread = threading.Thread(
        target=stream_output,
        args=(frontend_proc, "[FRONTEND]", "\033[32m")
    )

    backend_thread.daemon = True
    frontend_thread.daemon = True

    backend_thread.start()
    frontend_thread.start()

    try:
        # Esperar hasta que un proceso termine o el usuario presione Ctrl+C
        while True:
            if backend_proc.poll() is not None:
                print("\033[91m[SYSTEM] El Backend se ha detenido de forma inesperada.\033[0m")
                break
            if frontend_proc.poll() is not None:
                print("\033[91m[SYSTEM] El Frontend se ha detenido de forma inesperada.\033[0m")
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\n\033[95m[SYSTEM] Deteniendo servicios por petición del usuario...\033[0m")
    finally:
        # Terminar procesos limpiamente
        for proc, name in [(backend_proc, "Backend"), (frontend_proc, "Frontend")]:
            if proc.poll() is None:
                print(f"\033[95m[SYSTEM] Enviando señal de apagado a {name}...\033[0m")
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    print(f"\033[91m[SYSTEM] Forzando detención de {name}...\033[0m")
                    proc.kill()
        print("\033[95m[SYSTEM] Servicios detenidos.\033[0m")

if __name__ == "__main__":
    main()
