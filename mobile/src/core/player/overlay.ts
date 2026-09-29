/**
 * Where an anchored overlay is drawn on screen (D-036, D-039). Pure and worklet-safe so the
 * Reanimated style and the tests run the same code.
 *
 * Overlays are billboards: the anchor supplies the screen position only, never a rotation, so the
 * flame and labels stay upright on screen whatever the phone's pitch, roll or yaw.
 */
import { directionToVector, project, screenOffset, type Direction, type Quaternion } from '../orientation';
import { clampToBand, type Band } from './layout';
import type { Offset } from './prefabs';

export interface OverlayGeometry {
  cx: number;
  cy: number;
  pxPerDeg: number;
  focalPx: number;
  /** true: full-quaternion pinhole projection; false: the legacy linear mapping. */
  pinhole: boolean;
}

export interface OverlayPlacement {
  x: number;
  y: number;
  /** Pushed to the band edge because the real position is off screen or under the card. */
  pinned: boolean;
  /** Always 0: billboarded, never rotated with the phone. */
  rotateDeg: 0;
}

export function overlayPlacement(
  anchor: Direction,
  offset: Offset,
  scale: number,
  camera: { orientation: Quaternion; direction: Direction },
  g: OverlayGeometry,
  band?: Band,
): OverlayPlacement {
  'worklet';
  const target = {
    headingDeg: anchor.headingDeg + offset.dh * scale,
    elevationDeg: Math.max(-89.5, Math.min(89.5, anchor.elevationDeg + offset.de * scale)),
  };
  const p = g.pinhole ? project(directionToVector(target), camera.orientation, g.focalPx) : screenOffset(target, camera.direction, g.pxPerDeg);
  const at = band === undefined ? { x: g.cx + p.dx, y: g.cy + p.dy, pinned: false } : clampToBand(g.cx + p.dx, g.cy + p.dy, band);
  return { x: at.x, y: at.y, pinned: at.pinned, rotateDeg: 0 };
}
