import os
import struct

public_dir = '/home/byelo/koda-backend/KODA_Remaster/sistema-corporativo/frontend-enterprise/public'

for f in os.listdir(public_dir):
    fp = os.path.join(public_dir, f)
    if os.path.isdir(fp):
        continue
    size = os.path.getsize(fp)
    if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
        print(f"{f}: size = {size} bytes")
        try:
            with open(fp, 'rb') as img:
                data = img.read(30)
                # check if PNG
                if data[:8] == b'\x89PNG\r\n\x1a\n':
                    w, h = struct.unpack('>II', data[16:24])
                    print(f"  Type: PNG, width = {w}, height = {h}")
                # check if JPEG
                elif data[:2] == b'\xff\xd8':
                    print(f"  Type: JPEG")
                else:
                    print(f"  Type: Unknown image format")
        except Exception as e:
            print(f"  Error: {e}")
