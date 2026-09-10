"""
Compila la landing de KODA: toma template.html (con {{placeholders}})
y assets.json (imagenes en base64) y genera index.html final,
auto-contenido (HTML+CSS+JS+imagenes en un solo archivo).

Uso:
    python3 build.py

Cada vez que edites template.html o cambies una imagen en assets.json,
vuelve a correr este script y refresca el navegador.
"""
import json
import re

TEMPLATE = "template.html"
ASSETS = "assets.json"
OUTPUT = "index.html"

tpl = open(TEMPLATE, encoding="utf-8").read()
assets = json.load(open(ASSETS, encoding="utf-8"))

out = tpl
for key, value in assets.items():
    out = out.replace("{{" + key + "}}", value)

missing = set(re.findall(r"\{\{(\w+)\}\}", out))
if missing:
    print("AVISO: quedaron placeholders sin resolver (faltan en assets.json):", missing)

open(OUTPUT, "w", encoding="utf-8").write(out)
print(f"OK -> {OUTPUT} ({len(out)/1024/1024:.2f} MB)")
