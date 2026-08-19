import re

with open("src/app/login/page.jsx", "r") as f:
    content = f.read()

# Replace tailwind blue/cyan colors
content = content.replace("cyan-400", "emerald-500")
content = content.replace("cyan-300", "emerald-400")
content = content.replace("cyan-200", "emerald-300")
content = content.replace("cyan-500", "emerald-600")
content = content.replace("sky-950", "emerald-950")
content = content.replace("sky-700", "emerald-700")
content = content.replace("sky-300", "emerald-300")
content = content.replace("sky-600", "emerald-600")
content = content.replace("sky-500", "emerald-500")
content = content.replace("blue-500", "teal-500")
content = content.replace("blue-400", "teal-400")
content = content.replace("blue-600", "teal-600")

# Replace specific hex codes
content = content.replace("text-[#0D47A1]", "text-[#0b5156]")
content = content.replace("text-[#23A6D9]", "text-emerald-500")
content = content.replace("bg-[#23A6D9]", "bg-[#0b5156]")

# Gradient background in the page
content = content.replace("to-[#0d47a1]/24", "to-[#0b5156]/24")
content = content.replace("rgba(35,166,217,0.18)", "rgba(11,81,86,0.18)")

# CSS variables replacements (both blocks, light and dark mode are generally fine if we just replace the blue hues with green ones)
content = content.replace("#0d47a1", "#0b5156") # primary
content = content.replace("#355f87", "#2c5f59") # secondary
content = content.replace("rgba(13, 71, 161", "rgba(11, 81, 86")
content = content.replace("rgba(25, 118, 210", "rgba(11, 81, 86")
content = content.replace("#0d305f", "#062a2d") # input text
content = content.replace("#5f84a4", "#4d7a76") # input placeholder
content = content.replace("#4b7196", "#396460") # input icon

content = content.replace("#f0f9ff", "#f0fff4") # text primary dark
content = content.replace("#c6e3f5", "#c6f5d6") # text secondary dark
content = content.replace("rgba(103, 232, 249", "rgba(52, 211, 153") # card border dark
content = content.replace("rgba(56, 189, 248", "rgba(16, 185, 129") # footer border dark
content = content.replace("#f8fbff", "#f8fff9") # input text dark
content = content.replace("#8fb7d1", "#8fd1ac") # input placeholder dark

# Also change the logo to the transparent one
content = content.replace("logorecortado.png", "koda-logo-transparent.png")

with open("src/app/login/page.jsx", "w") as f:
    f.write(content)

print("Colors and logo replaced.")
