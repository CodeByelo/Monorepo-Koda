import os

dir_path = "/home/byelo/koda-backend/koda-frontend/src/pages"

for root, _, files in os.walk(dir_path):
    for f in files:
        if not f.endswith(".tsx"): continue
        filepath = os.path.join(root, f)
        with open(filepath, "r", encoding="utf-8") as file:
            lines = file.readlines()
        
        new_lines = []
        skip = False
        changed = False
        for i, line in enumerate(lines):
            if skip:
                if '</p>' in line or '</div>' in line or '</nav>' in line:
                    skip = False
                continue
                
            if 'Inicio /' in line:
                changed = True
                if '<p' in line and '</p>' in line:
                    continue
                elif '<p' in line:
                    skip = True
                    continue
                else:
                    if new_lines and '<p' in new_lines[-1]:
                        new_lines.pop()
                    if '</p>' not in line:
                        skip = True
                    continue

            if '<span>Inicio</span>' in line:
                changed = True
                if new_lines and '<div' in new_lines[-1]:
                    new_lines.pop()
                skip = True
                continue

            if '<nav' in line and 'Inicio' in "".join(lines[i:i+10]):
                changed = True
                skip = True
                continue
                
            new_lines.append(line)
            
        if changed:
            with open(filepath, "w", encoding="utf-8") as file:
                file.writelines(new_lines)
            print(f"Updated {f}")

print("Done")
