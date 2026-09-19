/**
 * Overlay prefabs placed by `place_on_plane` (docs/02: anchor, target and zone names are objects
 * inside the placed prefab). Positions are angular offsets in degrees from the placement anchor
 * (the floor point the worker tapped), because overlays are anchored by direction only (D-027).
 * This is gameplay layout, not safety content; tune it in device tests (T-28).
 */
import { angleDiff, type Direction } from '../orientation';

export interface Offset {
  /** Degrees to the right of the anchor. */
  dh: number;
  /** Degrees above the anchor. */
  de: number;
}

export interface Zone {
  dh: [number, number];
  de: [number, number];
}

export interface Prefab {
  /** Named objects the worker can see or tap (`tap_target` targets, drawn props). */
  objects: Record<string, Offset>;
  /** Named aim zones for `aim_and_hold`, first match wins. */
  zones: Record<string, Zone>;
  /** Waypoints for `move_to` a scene anchor, tapped in order; the last one is the anchor. */
  paths: Record<string, Offset[]>;
  /** Presentation changes when a step starts, e.g. docs/02 FIRE_01 "fire spreads (scripted)". */
  stepEffects?: Record<string, { fireLevel?: number }>;
}

/** Where a printed marker's stand-in sign sits in tabletop mode: behind the worker. */
export const VIRTUAL_MARKER_OFFSET: Offset = { dh: 160, de: 4 };

export const PREFABS: Record<string, Prefab> = {
  WorkshopFire: {
    objects: {
      Fire: { dh: 0, de: 6 },
      AlarmCallPoint: { dh: 18, de: 10 },
    },
    zones: {
      FireBase: { dh: [-7, 7], de: [-3, 5] },
      FlameTop: { dh: [-7, 7], de: [5, 15] },
    },
    stepEffects: { escalation: { fireLevel: 1.9 } },
    paths: {
      AttackSpot: [
        { dh: -12, de: -20 },
        { dh: -6, de: -13 },
        { dh: 0, de: -6 },
      ],
    },
  },
  ConfinedAreaEntrance: {
    objects: { Entrance: { dh: 0, de: 6 }, LeakSource: { dh: 8, de: 2 } },
    zones: {},
    paths: {
      LeakSource: [
        { dh: -10, de: -20 },
        { dh: -2, de: -12 },
        { dh: 8, de: -4 },
      ],
      FreshAirPoint: [
        { dh: -150, de: -15 },
        { dh: -170, de: -10 },
      ],
    },
  },
};

/** The camera direction relative to the anchor, as an offset. */
export function offsetFrom(anchor: Direction, camera: Direction): Offset {
  return { dh: angleDiff(camera.headingDeg, anchor.headingDeg), de: camera.elevationDeg - anchor.elevationDeg };
}

/** The zone under the screen-centre reticle, or "none". */
export function zoneAt(prefab: Prefab, at: Offset): string {
  for (const [name, z] of Object.entries(prefab.zones)) {
    if (at.dh >= z.dh[0] && at.dh <= z.dh[1] && at.de >= z.de[0] && at.de <= z.de[1]) return name;
  }
  return 'none';
}
