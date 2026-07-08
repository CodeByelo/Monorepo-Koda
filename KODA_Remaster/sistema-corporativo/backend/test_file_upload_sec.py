import sys
from pathlib import Path

# Importar validador desde main.py
try:
    from main import validate_magic_bytes
    print("✅ Validador importado exitosamente desde main.py.")
except ImportError as e:
    print(f"❌ Error al importar validate_magic_bytes: {e}")
    sys.exit(1)

def run_tests():
    print("\n--- INICIANDO PRUEBAS DE VALIDACIÓN DE FIRMAS BINARIAS (MAGIC NUMBERS) ---")
    
    # 1. Caso de Prueba: Archivo PDF legítimo
    pdf_bytes = b"%PDF-1.4\n%..."
    assert validate_magic_bytes(pdf_bytes, "manual.pdf") == True, "Fallo: PDF legítimo rechazado"
    print("✔️  PDF legítimo: ACEPTADO (Correcto)")

    # 2. Caso de Prueba: Imagen PNG legítima
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR..."
    assert validate_magic_bytes(png_bytes, "avatar.png") == True, "Fallo: PNG legítimo rechazado"
    print("✔️  PNG legítimo: ACEPTADO (Correcto)")

    # 3. Caso de Prueba: Imagen JPG legítima
    jpg_bytes = b"\xff\xd8\xff\xe0\x00\x10JFIF..."
    assert validate_magic_bytes(jpg_bytes, "producto.jpg") == True, "Fallo: JPG legítimo rechazado"
    print("✔️  JPG legítimo: ACEPTADO (Correcto)")

    # 4. Caso de Prueba: WebP legítimo
    webp_bytes = b"RIFF\x00\x00\x00\x00WEBPVP8..."
    assert validate_magic_bytes(webp_bytes, "imagen.webp") == True, "Fallo: WebP legítimo rechazado"
    print("✔️  WebP legítimo: ACEPTADO (Correcto)")

    # 5. Caso de Prueba: Intento de Spoofing (Ejecutable renombrado a PNG)
    exe_disguised_as_png = b"MZ\x90\x00\x03\x00\x00\x00..."  # Cabecera DOS PE executable (MZ)
    assert validate_magic_bytes(exe_disguised_as_png, "virus.png") == False, "Fallo: Ejecutable disfrazado de PNG fue aceptado"
    print("🛡️  Ejecutable disfrazado de PNG (.exe -> .png): RECHAZADO (Correcto)")

    # 6. Caso de Prueba: Script de Bash renombrado a XLSX
    bash_disguised_as_xlsx = b"#!/bin/bash\nrm -rf /"
    assert validate_magic_bytes(bash_disguised_as_xlsx, "reporte.xlsx") == False, "Fallo: Script de Bash disfrazado de XLSX fue aceptado"
    print("🛡️  Script bash disfrazado de XLSX (.sh -> .xlsx): RECHAZADO (Correcto)")

    # 7. Caso de Prueba: Archivo vacío
    empty_file = b""
    assert validate_magic_bytes(empty_file, "documento.pdf") == False, "Fallo: Archivo vacío aceptado"
    print("✔️  Archivo vacío: RECHAZADO (Correcto)")

    print("\n🎉 ¡TODAS LAS PRUEBAS BINARIAS PASARON EXITOSAMENTE! El sistema está blindado contra spoofing de archivos.")

if __name__ == "__main__":
    run_tests()
