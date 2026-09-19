/**
 * Screen layout of the camera overlays (D-027, D-033). Pure numbers so the rules are testable and
 * the clamp also runs inside Reanimated worklets.
 */

/** Horizontal field of view assumed for the portrait camera preview. Tune on device (T-28). */
export const PREVIEW_HFOV_DEG = 50;

/** Size of the drawn fire (a prefab's `Fire` object), in degrees. */
export const FIRE_SIZE_DEG = 18;

/** The box a labelled prefab object (ENTRANCE, FIRE ALARM, ...) may fill; its text wraps inside. */
export const LABEL_BOX_PX = { width: 140, height: 80 } as const;

/** The narrowest phone we lay prefabs out for, in dp: labels spread widest in degrees there. */
export const MIN_SCREEN_WIDTH_PX = 320;

/** Degrees a label box spans at a screen width (default: the narrowest supported). */
export function labelBoxDeg(screenWidthPx: number = MIN_SCREEN_WIDTH_PX): { dh: number; de: number } {
  const pxPerDeg = screenWidthPx / PREVIEW_HFOV_DEG;
  return { dh: LABEL_BOX_PX.width / pxPerDeg, de: LABEL_BOX_PX.height / pxPerDeg };
}

/** A screen region in px: the free space between the instruction card and the bottom panel. */
export interface Band {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Keeps an overlay's centre inside `band`, so something the worker must tap is never off screen
 * or under the card. An overlay that is really elsewhere is pinned to the edge nearest it.
 */
export function clampToBand(x: number, y: number, band: Band): { x: number; y: number; pinned: boolean } {
  'worklet';
  const cx = Math.min(Math.max(x, band.left), band.right);
  const cy = Math.min(Math.max(y, band.top), band.bottom);
  return { x: cx, y: cy, pinned: cx !== x || cy !== y };
}
