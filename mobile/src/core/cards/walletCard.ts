/**
 * Wallet cards (D-046): the worker ID card and the certificate card share one face, the size of a
 * bank card (ISO/IEC 7810 ID-1, 85.6 × 54 mm), so a shared image prints at the real size.
 * Layouts are in millimetres; `mmToPx` turns them into pixels for the width the card is drawn at.
 */

export const CARD_WIDTH_MM = 85.6;
export const CARD_HEIGHT_MM = 54;

/** Pixels per millimetre for a card drawn `widthPx` wide. */
export function pxPerMm(widthPx: number): number {
  return widthPx / CARD_WIDTH_MM;
}

/** Height of a card drawn `widthPx` wide, in px. */
export function cardHeightPx(widthPx: number): number {
  return (widthPx * CARD_HEIGHT_MM) / CARD_WIDTH_MM;
}

/** The on-screen card width: the space available, but never wider than `maxPx`. */
export function cardWidthPx(availablePx: number, maxPx: number): number {
  return Math.max(0, Math.min(availablePx, maxPx));
}

/**
 * The worker ID printed on the card: the employee code when the site uses one, otherwise the
 * first 8 characters of the worker's UUID in capitals (the full UUID is in the QR).
 */
export function cardWorkerId(worker: { id: string; employeeCode: string | null }): string {
  const code = worker.employeeCode?.trim();
  return code ? code : worker.id.slice(0, 8).toUpperCase();
}
