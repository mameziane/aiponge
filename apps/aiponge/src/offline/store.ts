/**
 * Offline Download Manager Store
 * Zustand store for managing offline downloads with persistence.
 *
 * Uses expo-file-system v19 class-based API (File, Directory, Paths)
 * for all filesystem operations. Directory creation is idempotent
 * and synchronous — eliminates the folder-creation race conditions
 * that plagued the legacy implementation.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Directory } from 'expo-file-system';
import { logger } from '../lib/logger';
import { isOfflineSupported, offlineDir } from './offlineEnv';
import type { DownloadStore, DownloadManagerState, OfflineTrack, DownloadJob, DownloadStatus } from './types';

const DEFAULT_STORAGE_LIMIT = 2 * 1024 * 1024 * 1024; // 2GB default

const initialState: DownloadManagerState = {
  currentUserId: null,
  downloads: {},
  queue: [],
  isProcessing: false,
  storageInfo: {
    usedBytes: 0,
    totalTracks: 0,
    limitBytes: DEFAULT_STORAGE_LIMIT,
  },
  storageLimit: DEFAULT_STORAGE_LIMIT,
};

/**
 * Get the size of a file at the given URI.
 * Returns 0 if the file doesn't exist or an error occurs.
 */
function getFileSize(path: string): number {
  if (!isOfflineSupported) return 0;
  try {
    const file = new File(path);
    return file.exists ? file.size : 0;
  } catch {
    return 0;
  }
}

/**
 * Delete the per-track directory and all its contents.
 * No-ops if the directory doesn't exist.
 */
function deleteTrackFiles(trackId: string): void {
  if (!isOfflineSupported) return;
  try {
    const trackDir = new Directory(offlineDir, trackId);
    if (trackDir.exists) trackDir.delete();
  } catch (error) {
    logger.warn('[OfflineStore] Error deleting track files', { trackId, error });
  }
}

export const useDownloadStore = create<DownloadStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setCurrentUser: (userId: string | null) => {
        const prev = get().currentUserId;
        if (prev === userId) return;
        logger.info('[OfflineStore] User changed', { from: prev, to: userId });
        set({ currentUserId: userId });
      },

      addToQueue: async track => {
        // Guard for Expo Go - offline downloads not supported
        if (!isOfflineSupported) {
          logger.debug('[OfflineStore] Offline downloads not supported in Expo Go');
          throw new Error('EXPO_GO_NOT_SUPPORTED');
        }

        const { downloads, queue, storageInfo, storageLimit } = get();

        // Skip if already downloaded or in queue
        if (downloads[track.id]?.status === 'completed') {
          logger.debug('[OfflineStore] Track already downloaded', { trackId: track.id });
          return;
        }

        if (queue.some(job => job.trackId === track.id)) {
          logger.debug('[OfflineStore] Track already in queue', { trackId: track.id });
          return;
        }

        // Check storage limit before adding (estimate ~10MB per track if size unknown)
        const estimatedSize = 10 * 1024 * 1024; // 10MB estimate
        if (storageInfo.usedBytes + estimatedSize > storageLimit) {
          logger.warn('[OfflineStore] Storage limit would be exceeded', {
            used: storageInfo.usedBytes,
            limit: storageLimit,
            trackId: track.id,
          });
          throw new Error('STORAGE_LIMIT_EXCEEDED');
        }

        // Create download job
        const job: DownloadJob = {
          trackId: track.id,
          track,
          priority: 0,
          retryCount: 0,
          createdAt: Date.now(),
        };

        // Create pending offline track entry (stamped with current userId)
        const offlineTrack: OfflineTrack = {
          id: track.id,
          trackId: track.id,
          userId: get().currentUserId || undefined,
          title: track.title,
          displayName: track.displayName,
          duration: track.duration,
          artworkUrl: track.artworkUrl,
          audioUrl: track.audioUrl,
          status: 'pending',
          progress: 0,
          size: 0,
        };

        set(state => ({
          queue: [...state.queue, job],
          downloads: {
            ...state.downloads,
            [track.id]: offlineTrack,
          },
        }));

        logger.info('[OfflineStore] Added to download queue', { trackId: track.id, title: track.title });
      },

      removeDownload: async trackId => {
        // Delete files first (only if offline supported)
        if (isOfflineSupported) {
          deleteTrackFiles(trackId);
        }

        set(state => {
          const { [trackId]: _removed, ...remainingDownloads } = state.downloads;
          return {
            downloads: remainingDownloads,
            queue: state.queue.filter(job => job.trackId !== trackId),
          };
        });

        // Refresh storage info (only if offline supported)
        if (isOfflineSupported) {
          get().refreshStorageInfo();
        }

        logger.info('[OfflineStore] Removed download', { trackId });
      },

      pauseDownload: trackId => {
        // v19 API does not support resumable downloads — pause redirects to cancel
        logger.info('[OfflineStore] Pause not supported with v19 API, cancelling instead', { trackId });
        get().cancelDownload(trackId);
      },

      resumeDownload: trackId => {
        const { downloads, queue } = get();
        const download = downloads[trackId];

        if (!download || (download.status !== 'paused' && download.status !== 'failed')) return;

        // Re-add to queue if not already there
        if (!queue.some(job => job.trackId === trackId)) {
          const job: DownloadJob = {
            trackId,
            track: {
              id: download.trackId,
              title: download.title,
              displayName: download.displayName,
              duration: download.duration,
              artworkUrl: download.artworkUrl,
              audioUrl: download.audioUrl,
            },
            priority: 1, // Higher priority for resumed downloads
            retryCount: 0,
            createdAt: Date.now(),
          };

          set(state => ({
            queue: [...state.queue, job],
            downloads: {
              ...state.downloads,
              [trackId]: { ...download, status: 'pending' as DownloadStatus },
            },
          }));
        }
      },

      cancelDownload: trackId => {
        // Remove the download entry entirely and clean up files.
        set(state => {
          const { [trackId]: _removed, ...remainingDownloads } = state.downloads;
          return {
            queue: state.queue.filter(job => job.trackId !== trackId),
            downloads: remainingDownloads,
          };
        });

        // Clean up any partially downloaded files
        deleteTrackFiles(trackId);
      },

      retryDownload: trackId => {
        const { downloads } = get();
        const download = downloads[trackId];

        if (!download || download.status !== 'failed') return;

        get().resumeDownload(trackId);
      },

      clearAllDownloads: async () => {
        // Skip entirely in Expo Go - no offline data exists
        if (!isOfflineSupported) {
          logger.debug('[OfflineStore] Skipping clearAllDownloads in Expo Go');
          set(state => ({
            ...initialState,
            currentUserId: state.currentUserId,
          }));
          return;
        }

        const { downloads, currentUserId } = get();

        // Only clear downloads belonging to the current user
        const ownedTrackIds: string[] = [];
        const remainingDownloads: Record<string, OfflineTrack> = {};

        for (const [id, dl] of Object.entries(downloads)) {
          if (isOwnedByCurrentUser(dl, currentUserId)) {
            ownedTrackIds.push(id);
          } else {
            remainingDownloads[id] = dl;
          }
        }

        // Delete file directories for current user's tracks only
        for (const trackId of ownedTrackIds) {
          deleteTrackFiles(trackId);
        }

        set(state => ({
          downloads: remainingDownloads,
          queue: state.queue.filter(job => !ownedTrackIds.includes(job.trackId)),
          isProcessing: false,
          storageInfo: { ...initialState.storageInfo, limitBytes: state.storageLimit },
          storageLimit: state.storageLimit,
          currentUserId: state.currentUserId,
        }));

        logger.info('[OfflineStore] Cleared downloads for current user', {
          userId: currentUserId,
          count: ownedTrackIds.length,
        });
      },

      updateProgress: (trackId, progress) => {
        set(state => ({
          downloads: {
            ...state.downloads,
            [trackId]: state.downloads[trackId]
              ? {
                  ...state.downloads[trackId],
                  progress,
                  status: 'downloading' as DownloadStatus,
                }
              : state.downloads[trackId],
          },
        }));
      },

      setDownloadStatus: (trackId, status, error) => {
        set(state => ({
          downloads: {
            ...state.downloads,
            [trackId]: state.downloads[trackId]
              ? {
                  ...state.downloads[trackId],
                  status,
                  error,
                  downloadedAt: status === 'completed' ? Date.now() : state.downloads[trackId].downloadedAt,
                }
              : state.downloads[trackId],
          },
          // Remove from queue if completed or failed
          queue:
            status === 'completed' || status === 'failed'
              ? state.queue.filter(job => job.trackId !== trackId)
              : state.queue,
        }));

        // Refresh storage info after download completes (deferred to avoid
        // synchronous cascading set() calls which trigger re-render loops)
        if (status === 'completed') {
          setTimeout(() => get().refreshStorageInfo(), 0);
        }
      },

      setLocalPaths: (trackId, audioPath, artworkPath) => {
        set(state => ({
          downloads: {
            ...state.downloads,
            [trackId]: state.downloads[trackId]
              ? {
                  ...state.downloads[trackId],
                  localAudioPath: audioPath,
                  localArtworkPath: artworkPath,
                }
              : state.downloads[trackId],
          },
        }));
      },

      updateLastPlayed: trackId => {
        set(state => ({
          downloads: {
            ...state.downloads,
            [trackId]: state.downloads[trackId]
              ? { ...state.downloads[trackId], lastPlayedAt: Date.now() }
              : state.downloads[trackId],
          },
        }));
      },

      setStorageLimit: limitBytes => {
        set({
          storageLimit: limitBytes,
          storageInfo: {
            ...get().storageInfo,
            limitBytes,
          },
        });
      },

      refreshStorageInfo: () => {
        // Skip file operations in Expo Go
        if (!isOfflineSupported) {
          logger.debug('[OfflineStore] Skipping storage refresh in Expo Go');
          return;
        }

        const { downloads } = get();
        let usedBytes = 0;
        let totalTracks = 0;

        for (const download of Object.values(downloads)) {
          if (download.status === 'completed' && download.localAudioPath) {
            usedBytes += getFileSize(download.localAudioPath);
            totalTracks++;
          }
        }

        set(state => ({
          storageInfo: {
            ...state.storageInfo,
            usedBytes,
            totalTracks,
          },
        }));
      },

      getLocalAudioPath: trackId => {
        const { downloads, currentUserId } = get();
        const download = downloads[trackId];
        if (
          download?.status === 'completed' &&
          download.localAudioPath &&
          isOwnedByCurrentUser(download, currentUserId)
        ) {
          return download.localAudioPath;
        }
        return undefined;
      },

      isDownloaded: trackId => {
        const { downloads, currentUserId } = get();
        const download = downloads[trackId];
        return (
          download?.status === 'completed' && !!download.localAudioPath && isOwnedByCurrentUser(download, currentUserId)
        );
      },

      loadFromStorage: () => {
        // Skip file verification in Expo Go
        if (!isOfflineSupported) {
          logger.debug('[OfflineStore] Skipping file verification in Expo Go');
          return;
        }

        // Verify that previously-downloaded files still exist on disk
        const { downloads } = get();
        const verifiedDownloads = { ...downloads };
        let hasChanges = false;

        for (const [trackId, download] of Object.entries(downloads)) {
          if (download.status === 'completed' && download.localAudioPath) {
            const file = new File(download.localAudioPath);
            if (!file.exists) {
              // File was deleted externally, mark as failed
              verifiedDownloads[trackId] = {
                ...download,
                status: 'failed' as DownloadStatus,
                error: 'File not found',
                localAudioPath: undefined,
              };
              hasChanges = true;
            }
          }
          // Migrate any 'paused' downloads from pre-v19 to 'pending' (resumable no longer supported)
          if (download.status === ('paused' as DownloadStatus)) {
            verifiedDownloads[trackId] = {
              ...download,
              status: 'pending' as DownloadStatus,
            };
            hasChanges = true;
          }
        }

        if (hasChanges) {
          set({ downloads: verifiedDownloads });
        }

        // Refresh storage info
        get().refreshStorageInfo();
      },
    }),
    {
      name: 'aiponge-offline-downloads',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: state => ({
        currentUserId: state.currentUserId,
        downloads: state.downloads,
        storageLimit: state.storageLimit,
      }),
      onRehydrateStorage: () => state => {
        if (state) {
          logger.debug('[OfflineStore] Hydrated', {
            downloadCount: Object.keys(state.downloads).length,
          });
          // Verify downloads after hydration
          setTimeout(() => {
            state.loadFromStorage();
          }, 1000);
        }
      },
    }
  )
);

// Helper: filter downloads belonging to the current user
// Downloads without a userId (pre-migration) are visible to all users
function isOwnedByCurrentUser(download: OfflineTrack, currentUserId: string | null): boolean {
  if (!download.userId) return true; // Legacy download (pre-migration), show to all
  if (!currentUserId) return false; // No user logged in, hide user-specific downloads
  return download.userId === currentUserId;
}

// Selectors for optimal re-renders (filtered by current user)
export const selectDownloads = (state: DownloadStore) => {
  const { downloads, currentUserId } = state;
  const filtered: Record<string, OfflineTrack> = {};
  for (const [id, dl] of Object.entries(downloads)) {
    if (isOwnedByCurrentUser(dl, currentUserId)) {
      filtered[id] = dl;
    }
  }
  return filtered;
};
export const selectQueue = (state: DownloadStore) => state.queue;
export const selectStorageInfo = (state: DownloadStore) => state.storageInfo;
export const selectIsDownloaded = (trackId: string) => (state: DownloadStore) => {
  const dl = state.downloads[trackId];
  return dl?.status === 'completed' && isOwnedByCurrentUser(dl, state.currentUserId);
};
export const selectDownloadStatus = (trackId: string) => (state: DownloadStore) => {
  const dl = state.downloads[trackId];
  return dl && isOwnedByCurrentUser(dl, state.currentUserId) ? dl.status : undefined;
};
export const selectDownloadProgress = (trackId: string) => (state: DownloadStore) => {
  const dl = state.downloads[trackId];
  return dl && isOwnedByCurrentUser(dl, state.currentUserId) ? dl.progress : 0;
};
// Primitive count selector — returns a number so Zustand's Object.is comparison works
// correctly. Use this instead of selectDownloads when you only need the count (e.g., UI badges).
export const selectCompletedDownloadCount = (state: DownloadStore) => {
  const { downloads, currentUserId } = state;
  let count = 0;
  for (const dl of Object.values(downloads)) {
    if (dl.status === 'completed' && dl.localAudioPath && isOwnedByCurrentUser(dl, currentUserId)) {
      count++;
    }
  }
  return count;
};

// Re-export for use in download hook and UI components
export { ensureTrackDir } from './offlineEnv';
export { isOfflineSupported } from './offlineEnv';
