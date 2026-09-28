// Printable markers (docs/02 "Markers", D-027, D-036): each is a QR code whose text is exactly the
// marker id, with a large label. EXIT_A / EXIT_B (150 mm) are for `find_marker` and `move_to` a
// marker; HAZARD_A (180 mm, laid on the floor) is FIRE_01's optional `anchorMarker`, which pins
// the fire in place while the camera sees it. Writes assets/markers/<ID>.svg; open it in a browser
// and print at 100%.
//   node scripts/markers.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import QRCode from 'qrcode';

const MARKERS = [
  { id: 'EXIT_A', label: 'EXIT A', color: '#1e7b34', widthMm: 150 },
  { id: 'EXIT_B', label: 'EXIT B', color: '#1e7b34', widthMm: 150 },
  { id: 'HAZARD_A', label: 'FIRE HERE', color: '#c2410c', widthMm: 180 },
];
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'markers');

async function markerSvg({ id, label, color, widthMm: WIDTH_MM }) {
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
  const textHeight = cells * 0.32;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH_MM}mm" height="${(WIDTH_MM * (cells + textHeight)) / cells}mm" viewBox="0 0 ${cells} ${cells + textHeight}">
  <rect width="${cells}" height="${cells + textHeight}" fill="#ffffff"/>
  <rect y="${cells}" width="${cells}" height="${textHeight}" fill="${color}"/>
  <text x="${cells / 2}" y="${cells + textHeight * 0.74}" font-family="Arial, sans-serif" font-weight="700" font-size="${textHeight * 0.62}" text-anchor="middle" fill="#ffffff">${label}</text>
  <path d="${path}" fill="#000000" shape-rendering="crispEdges"/>
</svg>
`;
}

mkdirSync(OUT_DIR, { recursive: true });
for (const marker of MARKERS) {
  writeFileSync(join(OUT_DIR, `${marker.id}.svg`), await markerSvg(marker));
  console.log(`wrote assets/markers/${marker.id}.svg`);
}
