import os

dir_path = "/home/byelo/koda-backend/koda-frontend/src/pages"

for root, _, files in os.walk(dir_path):
    for f in files:
        if not f.endswith(".tsx"): continue
        filepath = os.path.join(root, f)
        with open(filepath, "r", encoding="utf-8") as file:
            lines = file.readlines()
        
        delete_indices = set()
        
        for i, line in enumerate(lines):
            if '<h1' in line or '<h2' in line:
                # Look backwards up to 6 lines
                for j in range(i-1, max(-1, i-7), -1):
                    prev_line = lines[j]
                    if ' / ' in prev_line or '>/ ' in prev_line or '>/' in prev_line or ' /' in prev_line:
                        if '<p' in prev_line and '</p>' in prev_line:
                            delete_indices.add(j)
                        elif '<span' in prev_line and '</span>' in prev_line:
                            delete_indices.add(j)
                            if j-1 >= 0 and '<span' in lines[j-1] and ('bg-[' in lines[j-1] or 'bg-white' in lines[j-1] or 'INTELIGENCIA' in lines[j-1]):
                                delete_indices.add(j-1)
                                if j-2 >= 0 and '<div' in lines[j-2]:
                                    if j+1 < len(lines) and '</div>' in lines[j+1]:
                                        delete_indices.add(j-2)
                                        delete_indices.add(j+1)
        
        if delete_indices:
            new_lines = [line for idx, line in enumerate(lines) if idx not in delete_indices]
            with open(filepath, "w", encoding="utf-8") as file:
                file.writelines(new_lines)
            print(f"Updated {f}")

print("Done")
