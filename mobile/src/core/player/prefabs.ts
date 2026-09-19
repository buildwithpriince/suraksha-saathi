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
  /** Localization keys of the objects drawn as labelled overlays; others are not drawn as labels. */
  labels: Record<string, string>;
  /** Named aim zones for `aim_and_hold`, first match wins. */
  zones: Record<string, Zone>;
  /** Waypoints for `move_to` a scene anchor, tapped in order; the last one is the anchor. */
  paths: Record<string, Offset[]>;
  /** Overlay metre scale: metres per degree of offset, for `mark_zone` cone radii (D-031). */
  metresPerDeg?: number;
  /** A gas cloud drawn around a named object, visible once a step effect sets `gasLevel`. */
  cloud?: { at: string; sizeDeg: number };
  /** Presentation changes when a step starts, e.g. docs/02 FIRE_01 "fire spreads (scripted)". */
  stepEffects?: Record<string, { fireLevel?: number; gasLevel?: number }>;
}

/** Where a printed marker's stand-in sign sits in tabletop mode: behind the worker. */
export const VIRTUAL_MARKER_OFFSET: Offset = { dh: 160, de: 4 };

export const PREFABS: Record<string, Prefab> = {
  WorkshopFire: {
    objects: {
      Fire: { dh: 0, de: 6 },
      AlarmCallPoint: { dh: 20, de: 10 }, // clear of the fire drawing on a 320 dp screen
    },
    labels: { AlarmCallPoint: 'training.object.alarm_call_point' },
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
    // Labels at least one label box apart on a 320 dp screen (layout.ts, prefabs.test.ts)
    objects: { Entrance: { dh: -14, de: 8 }, LeakSource: { dh: 10, de: -1 } },
    labels: { Entrance: 'training.object.entrance', LeakSource: 'training.object.leak_source' },
    zones: {},
    // 10 degrees = 1.5 m: the minor alert radius spans a third of the preview width (tune in T-33)
    metresPerDeg: 0.15,
    cloud: { at: 'LeakSource', sizeDeg: 14 },
    stepEffects: { detect: { gasLevel: 1 } },
    paths: {
      // Ends just below the GAS LEAK label, not on it
      LeakSource: [
        { dh: -8, de: -24 },
        { dh: 2, de: -18 },
        { dh: 10, de: -13 },
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
