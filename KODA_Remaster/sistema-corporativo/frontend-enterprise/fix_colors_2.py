import re

with open("src/app/login/page.jsx", "r") as f:
    content = f.read()

content = content.replace("from-[#d1e4e9]", "from-[#e0f2f1]")
content = content.replace("via-[#bdd8e3]", "via-[#b2dfdb]")

content = content.replace("rgba(34,211,238", "rgba(16,185,129")
content = content.replace("bg-gradient-to-br from-[#eaf4f6] via-[#d1e4e9] to-[#b7d6e2]", "")

# And there is a radial gradient in the style tag:
content = content.replace("linear-gradient(135deg, #d1e4e9 0%, #c1dce5 45%, #9bc6da 100%)", "linear-gradient(135deg, #e0f2f1 0%, #b2dfdb 45%, #80cbc4 100%)")
content = content.replace("bg-teal-400", "bg-emerald-400") # Some remaining blue->teal to emerald

with open("src/app/login/page.jsx", "w") as f:
    f.write(content)

