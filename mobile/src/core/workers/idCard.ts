/**
 * Worker ID card (docs/00 D4, D-034): a printed card whose QR selects the worker at the kiosk.
 * The QR text is `SW1:<worker uuid>`. It identifies, it doesn't authenticate: scanning it does what
 * tapping the worker in the list does, so it is not signed and carries no name.
 */
import QRCode from 'qrcode';

export const WORKER_CARD_PREFIX = 'SW1:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CERTIFICATE_PREFIX = 'SS1.'; // docs/04 certificate tokens

/** The QR text for a worker's card. */
export function workerCardText(workerId: string): string {
  const id = workerId.toLowerCase();
  if (!UUID.test(id)) throw new Error('worker id must be a UUID');
  return WORKER_CARD_PREFIX + id;
}

export type ScannedCard = { kind: 'worker'; workerId: string } | { kind: 'certificate' } | { kind: 'other' };

/** What a scanned QR is. Whitespace around it and the case of the UUID are ignored. */
export function parseScannedCard(text: string): ScannedCard {
  const s = text.trim();
  if (s.startsWith(WORKER_CARD_PREFIX)) {
    const id = s.slice(WORKER_CARD_PREFIX.length).toLowerCase();
    return UUID.test(id) ? { kind: 'worker', workerId: id } : { kind: 'other' };
  }
  return s.startsWith(CERTIFICATE_PREFIX) ? { kind: 'certificate' } : { kind: 'other' };
}

/** Modules of quiet zone around a printed QR (the QR standard's minimum). */
const QUIET_MODULES = 4;

/** The QR as SVG, one unit per module. Error correction Q, so a worn or glossy card still scans. */
export function qrSvg(text: string): string {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'Q' });
  const n = modules.size;
  let path = '';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (modules.get(row, col)) path += `M${col + QUIET_MODULES} ${row + QUIET_MODULES}h1v1h-1z`;
    }
  }
  const size = n + 2 * QUIET_MODULES;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`
  );
}

export interface CardFace {
  name: string;
  /** Already-localized detail lines, e.g. "Site: DHN-01". */
  lines: string[];
  qrText: string;
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]!);
}

/**
 * A printable A4 sheet of ID cards, each 85.6 × 54 mm (bank-card size) inside a dashed cut line.
 * `heading` and `title` are localized (app name, "Worker ID card"); every text is escaped.
 */
export function idCardSheetHtml(cards: readonly CardFace[], labels: { heading: string; title: string }): string {
  const faces = cards
    .map(
      (c) =>
        `<div class="card"><div class="qr">${qrSvg(c.qrText)}</div><div class="info">` +
        `<div class="app">${escapeHtml(labels.heading)}</div><div class="title">${escapeHtml(labels.title)}</div>` +
        `<div class="name">${escapeHtml(c.name)}</div>` +
        c.lines.map((l) => `<div class="line">${escapeHtml(l)}</div>`).join('') +
        `</div></div>`,
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page { size: A4; margin: 10mm; }
body { margin: 0; font-family: 'Noto Sans Devanagari', 'Noto Sans', sans-serif; color: #111; }
.sheet { display: grid; grid-template-columns: repeat(2, 85.6mm); gap: 6mm; }
.card { width: 85.6mm; height: 54mm; box-sizing: border-box; padding: 3mm; border: 0.3mm dashed #888;
  border-radius: 3mm; display: flex; gap: 3mm; align-items: center; break-inside: avoid; }
.qr { width: 40mm; height: 40mm; flex: none; }
.qr svg { width: 100%; height: 100%; }
.info { min-width: 0; display: flex; flex-direction: column; gap: 1mm; }
.app { font-size: 8pt; color: #0b3d63; font-weight: 700; }
.title { font-size: 7pt; color: #555; }
.name { font-size: 13pt; font-weight: 700; overflow-wrap: anywhere; }
.line { font-size: 8.5pt; }
</style></head><body><div class="sheet">${faces}</div></body></html>`;
}
