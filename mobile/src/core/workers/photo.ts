/**
 * Worker ID card photos (D-046): one JPEG per worker in the app's document folder, on this phone
 * only (never synced or put in a QR). The file name carries the time it was taken, so a retaken
 * photo gets a new URI and the image cache cannot show the old one.
 */

const EXTENSION = '.jpg';

/** File name for a photo of this worker taken at `takenAtMs` (unix milliseconds). */
export function photoFileName(workerId: string, takenAtMs: number): string {
  return `${workerId.toLowerCase()}-${Math.trunc(takenAtMs)}${EXTENSION}`;
}

/** When a file name is one of this worker's photos, the time it was taken; otherwise null. */
function takenAt(name: string, workerId: string): number | null {
  const prefix = `${workerId.toLowerCase()}-`;
  if (!name.startsWith(prefix) || !name.endsWith(EXTENSION)) return null;
  const stamp = name.slice(prefix.length, -EXTENSION.length);
  return /^\d+$/.test(stamp) ? Number(stamp) : null;
}

/** The newest of this worker's photos among `names`, or null if there is none. */
export function latestPhotoName(names: readonly string[], workerId: string): string | null {
  let best: { name: string; at: number } | null = null;
  for (const name of names) {
    const at = takenAt(name, workerId);
    if (at !== null && (best === null || at > best.at)) best = { name, at };
  }
  return best?.name ?? null;
}

/** This worker's photos among `names` other than `keep` (older ones to delete). */
export function stalePhotoNames(names: readonly string[], workerId: string, keep: string | null): string[] {
  return names.filter((name) => name !== keep && takenAt(name, workerId) !== null);
}
