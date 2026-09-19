/**
 * `move_to` a scene anchor (D-027, D-033): the worker taps the waypoints of the drawn path. Taps
 * count in path order, but tapping one further along also counts the ones before it, so a mark
 * that is hard to reach never blocks the run. Reaching the last one is arrival.
 */

export interface WaypointTap {
  /** Waypoints reached after the tap. */
  reached: number;
  /** The last waypoint was reached: record `position_reached` and complete the step. */
  arrived: boolean;
}

/** `reached` waypoints so far; `tapped` is the index tapped. Null for a mark already reached. */
export function tapWaypoint(reached: number, tapped: number, pathLength: number): WaypointTap | null {
  if (!Number.isInteger(tapped) || tapped < reached || tapped >= pathLength) return null;
  return { reached: tapped + 1, arrived: tapped + 1 === pathLength };
}
