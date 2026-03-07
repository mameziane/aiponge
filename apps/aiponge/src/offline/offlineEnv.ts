/**
 * Offline Environment Module
 *
 * Provides directory helpers for offline file storage using
 * expo-file-system v19 class-based API (File, Directory, Paths).
 *
 * All directory creation is idempotent and synchronous — safe to
 * call repeatedly without race conditions.
 */
import { Directory, Paths } from 'expo-file-system';

/** Whether offline file operations are supported on this device. */
export const isOfflineSupported = true;

/** The root offline storage directory: {documentDirectory}/offline/ */
export const offlineDir = new Directory(Paths.document, 'offline');

/**
 * Ensures the offline root directory exists.
 * Idempotent — safe to call multiple times, no-ops if already present.
 */
export function ensureOfflineDir(): void {
  offlineDir.create({ intermediates: true, idempotent: true });
}

/**
 * Ensures a per-track subdirectory exists under the offline root.
 * Returns the Directory instance for the track.
 *
 * @example
 * const trackDir = ensureTrackDir('abc-123');
 * const audioFile = new File(trackDir, 'audio.m4a');
 */
export function ensureTrackDir(trackId: string): Directory {
  const trackDir = new Directory(offlineDir, trackId);
  trackDir.create({ intermediates: true, idempotent: true });
  return trackDir;
}
