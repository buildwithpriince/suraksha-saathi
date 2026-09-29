import { Directory, File, Paths } from 'expo-file-system';

import { latestPhotoName, photoFileName, stalePhotoNames } from '@/core/workers/photo';

/**
 * Worker ID card photos (D-046), kept in the app's document folder on this phone only. They are
 * never synced, never sent to the server and never put in a QR.
 */
function folder(): Directory {
  return new Directory(Paths.document, 'worker-photos');
}

function names(dir: Directory): string[] {
  return dir.exists ? dir.list().map((entry) => entry.name) : [];
}

/** The URI of this worker's photo, or null if none was taken. */
export function workerPhotoUri(workerId: string): string | null {
  const dir = folder();
  const name = latestPhotoName(names(dir), workerId);
  return name === null ? null : new File(dir, name).uri;
}

/** Moves a just-taken photo (a cache file) into place as this worker's photo; older ones are deleted. */
export function saveWorkerPhoto(workerId: string, takenUri: string): string {
  const dir = folder();
  if (!dir.exists) dir.create({ intermediates: true });
  const name = photoFileName(workerId, Date.now());
  const target = new File(dir, name);
  new File(takenUri).moveSync(target);
  for (const stale of stalePhotoNames(names(dir), workerId, name)) new File(dir, stale).delete();
  return target.uri;
}

/** Deletes this worker's photo, so the card shows the placeholder again. */
export function removeWorkerPhoto(workerId: string): void {
  const dir = folder();
  for (const stale of stalePhotoNames(names(dir), workerId, null)) new File(dir, stale).delete();
}

/** Deletes a full-size camera shot from the cache once it has been framed or retaken. */
export function discardTakenPhoto(uri: string): void {
  try {
    new File(uri).delete();
  } catch {
    // Already gone, or not ours to delete: the cache is cleared by Android anyway
  }
}
