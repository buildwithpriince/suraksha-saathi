// Printable exit markers (docs/02 "Markers", D-027): each is a QR code whose text is exactly the
// marker id (`EXIT_A`), printed 150 mm wide with a large EXIT label, for `find_marker` and
// `move_to` a marker. Writes assets/markers/<ID>.svg; open it in a browser and print at 100%.
//   node scripts/markers.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import QRCode from 'qrcode';

const MARKERS = ['EXIT_A', 'EXIT_B'];
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'markers');
const WIDTH_MM = 150;

async function markerSvg(id) {
  const qr = QRCode.create(id, { errorCorrectionLevel: 'H' });
  const n = qr.modules.size;
  const quiet = 4;
  const cells = n + 2 * quiet;
  let path = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules.get(x, y)) path += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }
  }
  const label = `EXIT ${id.slice(id.indexOf('_') + 1)}`;
  const textHeight = cells * 0.32;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH_MM}mm" height="${(WIDTH_MM * (cells + textHeight)) / cells}mm" viewBox="0 0 ${cells} ${cells + textHeight}">
  <rect width="${cells}" height="${cells + textHeight}" fill="#ffffff"/>
  <rect y="${cells}" width="${cells}" height="${textHeight}" fill="#1e7b34"/>
  <text x="${cells / 2}" y="${cells + textHeight * 0.74}" font-family="Arial, sans-serif" font-weight="700" font-size="${textHeight * 0.62}" text-anchor="middle" fill="#ffffff">${label}</text>
  <path d="${path}" fill="#000000" shape-rendering="crispEdges"/>
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const id of MARKERS) {
  writeFileSync(join(OUT_DIR, `${id}.svg`), await markerSvg(id));
  console.log(`wrote assets/markers/${id}.svg`);
}
