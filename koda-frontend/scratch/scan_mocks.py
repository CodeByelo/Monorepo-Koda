import os
import re

pages_dir = 'c:/Users/USR/Desktop/koda-frontend/src/pages'

def scan_files():
    # Regex to find array literal declarations of objects: e.g. [ { key: value } ]
    # We look for something like = [ followed by optional whitespace and {
    array_object_regex = re.compile(r'=\s*\[\s*\{\s*["\'\w]+:', re.MULTILINE)
    
    # We also look for direct mapping over inline arrays: [ { ... } ].map(...)
    inline_array_regex = re.compile(r'\[\s*\{\s*["\'\w]+:', re.MULTILINE)
    
    results = []
    
    for root, dirs, files in os.walk(pages_dir):
        for file in files:
            if file.endswith('.tsx'):
                path = os.path.join(root, file)
                with open(path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                # Exclude files that are just components or layouts if we want, but let's check all
                matches = list(array_object_regex.finditer(content))
                matches_inline = list(inline_array_regex.finditer(content))
                
                if matches or matches_inline:
                    results.append((path, len(matches), len(matches_inline)))
                    
    print("Found files with potential mock arrays:")
    for r in results:
        # Get relative path from pages_dir
        rel = os.path.relpath(r[0], pages_dir)
        print(f"  {rel} (assigned arrays: {r[1]}, inline arrays: {r[2]})")

if __name__ == '__main__':
    scan_files()
