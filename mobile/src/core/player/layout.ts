/**
 * Screen layout of the camera overlays (D-027, D-033). Pure numbers so the rules are testable and
 * the clamp also runs inside Reanimated worklets.
 */

/**
 * Legacy anchoring only (Settings "old anchoring", D-036): the horizontal field of view the
 * original linear mapping assumed. Too wide for a tall phone, which made overlays slide.
 */
export const PREVIEW_HFOV_DEG = 50;

/**
 * Field of view across the long side of the camera's 4:3 stream, which is vertical in portrait.
 * Typical phone main cameras (24–28 mm equivalent) give 63–72°. Tune on device (T-28).
 */
export const CAMERA_LONG_SIDE_FOV_DEG = 66;
/** Aspect of the camera stream, long side / short side. */
export const CAMERA_STREAM_ASPECT = 4 / 3;

// Worklets capture the functions they call when they are defined, so a worklet must come after
// every local worklet it calls (worklets.test.ts checks this).

/** Height in px the 3:4 portrait stream is drawn at when FILL_CENTER scales it to cover the view. */
export function shownStreamHeight(viewWidth: number, viewHeight: number): number {
  'worklet';
  return Math.max(viewHeight, viewWidth * CAMERA_STREAM_ASPECT);
}

/**
 * Focal length in dp of the portrait camera preview (D-036). expo-camera's preview fills the view
 * and crops the overflow (FILL_CENTER), so on a tall phone the stream's long side spans the full
 * height and its sides are cut off: far less than 50° is visible across the width.
 */
export function focalLengthPx(viewWidth: number, viewHeight: number, longSideFovDeg: number = CAMERA_LONG_SIDE_FOV_DEG): number {
  'worklet';
  return shownStreamHeight(viewWidth, viewHeight) / 2 / Math.tan((longSideFovDeg * Math.PI) / 360);
}

/** Pixels per degree at the centre of the preview. */
export function pxPerDegAt(viewWidth: number, viewHeight: number, longSideFovDeg?: number): number {
  return (focalLengthPx(viewWidth, viewHeight, longSideFovDeg) * Math.PI) / 180;
}

/** The lens's long-side FOV that a measured focal length implies for this view (D-039 calibration). */
export function longSideFovFromFocal(viewWidth: number, viewHeight: number, focalPx: number): number {
  return (2 * Math.atan(shownStreamHeight(viewWidth, viewHeight) / 2 / focalPx) * 180) / Math.PI;
}

/** What the view actually shows: degrees across and top to bottom. */
export function visibleFovDeg(viewWidth: number, viewHeight: number, focalPx: number): { across: number; down: number } {
  const deg = (px: number) => (2 * Math.atan(px / 2 / focalPx) * 180) / Math.PI;
  return { across: deg(viewWidth), down: deg(viewHeight) };
}

/** Size of the drawn fire (a prefab's `Fire` object), in degrees. */
export const FIRE_SIZE_DEG = 18;

/** The box a labelled prefab object (ENTRANCE, FIRE ALARM, ...) may fill; its text wraps inside. */
export const LABEL_BOX_PX = { width: 140, height: 80 } as const;

/**
 * The smallest phone we lay prefabs out for, in dp: labels spread widest in degrees on it, in
 * both the legacy mapping (width) and the pinhole one (height).
 */
export const MIN_SCREEN_PX = { width: 320, height: 568 } as const;
export const MIN_SCREEN_WIDTH_PX = MIN_SCREEN_PX.width;

/**
 * Degrees a label box spans on a screen (default: the smallest supported), whichever of the two
 * projections spreads it wider, so a layout that passes the test holds in both.
 */
export function labelBoxDeg(screenWidthPx: number = MIN_SCREEN_PX.width, screenHeightPx: number = MIN_SCREEN_PX.height): { dh: number; de: number } {
  const pxPerDeg = Math.min(screenWidthPx / PREVIEW_HFOV_DEG, pxPerDegAt(screenWidthPx, screenHeightPx));
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
