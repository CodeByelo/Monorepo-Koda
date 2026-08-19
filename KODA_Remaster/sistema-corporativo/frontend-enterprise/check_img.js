const fs = require('fs');
const { PNG } = require('pngjs');

const data = fs.readFileSync('/home/byelo/koda-backend/KODA_Remaster/sistema-corporativo/frontend-enterprise/public/logorecortado.png');
const png = PNG.sync.read(data);

let minX = png.width, maxX = 0;
for (let y = 0; y < png.height; y++) {
  for (let x = 0; x < png.width; x++) {
    const idx = (png.width * y + x) << 2;
    const r = png.data[idx];
    const g = png.data[idx+1];
    const b = png.data[idx+2];
    const a = png.data[idx+3];
    // Not purely white/transparent
    if (a > 0 && (r < 250 || g < 250 || b < 250)) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }
}
console.log(`Image width: ${png.width}, Non-white content from X=${minX} to X=${maxX}`);
