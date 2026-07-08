import os
import struct

public_dir = '/home/byelo/koda-backend/KODA_Remaster/sistema-corporativo/frontend-enterprise/public'
files = ['koda-auth-mark.jpeg', 'koda-logo.jpeg']

def get_jpeg_size(filepath):
    with open(filepath, 'rb') as f:
        # Read magic number
        if f.read(2) != b'\xff\xd8':
            return None
        while True:
            marker, = struct.unpack('>H', f.read(2))
            # Markers starting with FF
            if marker & 0xff00 != 0xff00:
                break
            length, = struct.unpack('>H', f.read(2))
            if marker in (0xffc0, 0xffc2): # SOF0, SOF2
                f.read(1) # precision
                h, w = struct.unpack('>HH', f.read(4))
                return w, h
            else:
                f.read(length - 2)
    return None

for f in files:
    fp = os.path.join(public_dir, f)
    if os.path.exists(fp):
        size = get_jpeg_size(fp)
        print(f"{f}: size = {size}")
    else:
        print(f"{f} does not exist")
