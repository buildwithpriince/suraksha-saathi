/**
 * Optional printed-marker anchoring (D-036). A scenario's `place_on_plane` step may name an
 * `anchorMarker` (FIRE_01: `HAZARD_A`, printed and laid on the floor where the fire should be).
 * While the camera sees it, the anchor is pulled onto the marker's direction and the overlay is
 * scaled by the marker's apparent size, which undoes the drift from walking that sensor anchoring
 * cannot see. Out of frame, sensor anchoring carries on from the last correction.
 */
import { angleDiff, unproject, vectorToDirection, type Direction, type Quaternion } from '../orientation';

/** Barcode results arrive a frame or two late; while turning faster than this they are skipped. */
export const MARKER_MAX_SPEED_DEG_PER_SEC = 40;
/** Smaller detections are too noisy to size or place anything by. */
export const MARKER_MIN_SIZE_PX = 24;
/** Weight of each new sighting (barcode results come at roughly 5–15 Hz). */
export const MARKER_BLEND = 0.5;
/** Overlay scale limits: from 2.5× farther than the reference sighting to 3× nearer. */
export const MARKER_SCALE_RANGE = [0.4, 3] as const;
/** A lock older than this is shown as lost. */
export const MARKER_LOCK_FRESH_SEC = 0.6;

export interface Point {
  x: number;
  y: number;
}

export interface MarkerSighting {
  /** Marker centre in view px (origin top left). */
  x: number;
  y: number;
  /** Longest edge, px: the edge least foreshortened when the marker lies on the floor. */
  sizePx: number;
}

/** A sighting from a barcode's corner points (view px), or null if unusable. */
export function sightingFrom(corners: readonly Point[] | undefined): MarkerSighting | null {
  if (corners === undefined || corners.length < 3) return null;
  let x = 0;
  let y = 0;
  let sizePx = 0;
  corners.forEach((p, i) => {
    x += p.x;
    y += p.y;
    const next = corners[(i + 1) % corners.length]!;
    sizePx = Math.max(sizePx, Math.hypot(next.x - p.x, next.y - p.y));
  });
  if (sizePx < MARKER_MIN_SIZE_PX) return null;
  return { x: x / corners.length, y: y / corners.length, sizePx };
}

export interface AnchorFix {
  anchor: Direction;
  scale: number;
  /** The marker size that means scale 1: the first sighting after placement. */
  refSizePx: number;
}

/**
 * Folds one sighting into the anchor. `current` is the anchor now (null before placement),
 * `refSizePx` null until the first sighting. Returns null when the sighting must be ignored.
 */
export function applySighting(
  sighting: MarkerSighting,
  view: { cx: number; cy: number; focalPx: number },
  q: Quaternion,
  speedDegPerSec: number,
  current: { anchor: Direction | null; scale: number; refSizePx: number | null },
): AnchorFix | null {
  if (speedDegPerSec > MARKER_MAX_SPEED_DEG_PER_SEC) return null;
  const measured = vectorToDirection(unproject(sighting.x - view.cx, sighting.y - view.cy, q, view.focalPx));
  const refSizePx = current.refSizePx ?? sighting.sizePx;
  const [lo, hi] = MARKER_SCALE_RANGE;
  const measuredScale = Math.min(hi, Math.max(lo, sighting.sizePx / refSizePx));
  if (current.anchor === null) return { anchor: measured, scale: measuredScale, refSizePx };
  return {
    anchor: blendDirection(current.anchor, measured, MARKER_BLEND),
    scale: current.scale + (measuredScale - current.scale) * MARKER_BLEND,
    refSizePx,
  };
}

/** a moved `weight` of the way to b, heading taken the short way round. */
export function blendDirection(a: Direction, b: Direction, weight: number): Direction {
  return {
    headingDeg: (a.headingDeg + angleDiff(b.headingDeg, a.headingDeg) * weight + 360) % 360,
    elevationDeg: a.elevationDeg + (b.elevationDeg - a.elevationDeg) * weight,
  };
}
