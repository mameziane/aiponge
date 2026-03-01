/**
 * Offline Download Hook
 * Handles file download operations with progress tracking
 *
 * Environment Detection:
 * - Expo Go: Returns disabled state (native FileSystem not available)
 * - Development Build: Uses expo-file-system for real file operations
 */

import { useCallback, useRef, useEffect } from 'react';
import { useDownloadStore, OFFLINE_DIR, ensureTrackDir } from './store';
import { useNetworkStatus } from '../hooks/system/useNetworkStatus';
import { logger } from '../lib/logger';
import { FileSystem, isOfflineSupported } from './offlineEnv';
import type { OfflineTrack } from './types';

interface DownloadResumableRef {
  trackId: string;
  resumable: ReturnType<typeof FileSystem.createDownloadResumable>;
}

export function useOfflineDownload() {
  const networkStatus = useNetworkStatus();
  const activeDownloadsRef = useRef<Map<string, DownloadResumableRef>>(new Map());

  const {
    downloads,
    queue,
    isProcessing,
    storageInfo,
    addToQueue,
    removeDownload: storeRemoveDownload,
    pauseDownload: storePause,
    resumeDownload: storeResume,
    cancelDownload: storeCancel,
    updateProgress,
    setDownloadStatus,
    setLocalPaths,
    refreshStorageInfo: storeRefreshStorageInfo,
    getLocalAudioPath,
    isDownloaded,
  } = useDownloadStore();

  const processQueue = useCallback(async () => {
    const state = useDownloadStore.getState();

    if (state.isProcessing || state.queue.length === 0) {
      return;
    }

    if (!networkStatus.isConnected) {
      logger.debug('[OfflineDownload] Offline - pausing queue processing');
      return;
    }

    // Mark as processing
    useDownloadStore.setState({ isProcessing: true });

    // Get next job from queue (highest priority first)
    const sortedQueue = [...state.queue].sort((a, b) => b.priority - a.priority);
    const job = sortedQueue[0];

    if (!job) {
      useDownloadStore.setState({ isProcessing: false });
      return;
    }

    logger.info('[OfflineDownload] Starting download', {
      trackId: job.trackId,
      title: job.track.title,
    });

    try {
      // Create track directory
      const trackDir = await ensureTrackDir(job.trackId);
      const audioPath = trackDir + 'audio.m4a';

      // Create download resumable
      const downloadResumable = FileSystem.createDownloadResumable(
        job.track.audioUrl,
        audioPath,
        {},
        downloadProgress => {
          const progress =
            downloadProgress.totalBytesExpectedToWrite > 0
              ? downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
              : 0;
          updateProgress(job.trackId, progress);
        }
      );

      // Store reference for pause/cancel
      activeDownloadsRef.current.set(job.trackId, {
        trackId: job.trackId,
        resumable: downloadResumable,
      });

      // Start download
      setDownloadStatus(job.trackId, 'downloading');
      const result = await downloadResumable.downloadAsync();

      if (result?.uri) {
        // Download artwork if available
        let artworkPath: string | undefined;
        if (job.track.artworkUrl) {
          try {
            artworkPath = trackDir + 'artwork.jpg';
            await FileSystem.downloadAsync(job.track.artworkUrl, artworkPath);
          } catch (artworkError) {
            logger.warn('[OfflineDownload] Artwork download failed', {
              trackId: job.trackId,
              error: artworkError,
            });
          }
        }

        // Get file size
        const fileInfo = await FileSystem.getInfoAsync(result.uri);
        const size = fileInfo.exists && 'size' in fileInfo ? fileInfo.size || 0 : 0;

        // Update store with success
        setLocalPaths(job.trackId, result.uri, artworkPath);
        useDownloadStore.setState(state => ({
          downloads: {
            ...state.downloads,
            [job.trackId]: {
              ...state.downloads[job.trackId],
              size: size as number,
            },
          },
        }));
        setDownloadStatus(job.trackId, 'completed');

        logger.info('[OfflineDownload] Download completed', {
          trackId: job.trackId,
          size,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      logger.error('[OfflineDownload] Download failed', {
        trackId: job.trackId,
        error: errorMessage,
      });
      setDownloadStatus(job.trackId, 'failed', errorMessage);
    } finally {
      // Remove from active downloads
      activeDownloadsRef.current.delete(job.trackId);

      // Mark as not processing and continue with next
      useDownloadStore.setState({ isProcessing: false });

      // Process next item in queue
      setTimeout(() => {
        const currentState = useDownloadStore.getState();
        if (currentState.queue.length > 0 && networkStatus.isConnected) {
          processQueue();
        }
      }, 100);
    }
  }, [networkStatus.isConnected, updateProgress, setDownloadStatus, setLocalPaths]);

  // Start processing queue when items are added
  useEffect(() => {
    if (queue.length > 0 && !isProcessing && networkStatus.isConnected) {
      processQueue();
    }
  }, [queue.length, isProcessing, networkStatus.isConnected, processQueue]);

  // Pause download
  const pauseDownload = useCallback(
    async (trackId: string) => {
      const activeDownload = activeDownloadsRef.current.get(trackId);
      if (activeDownload) {
        try {
          await activeDownload.resumable.pauseAsync();
          storePause(trackId);
          logger.info('[OfflineDownload] Download paused', { trackId });
        } catch (error) {
          logger.warn('[OfflineDownload] Error pausing download', { trackId, error });
        }
      }
    },
    [storePause]
  );

  // Resume download
  const resumeDownload = useCallback(
    async (trackId: string) => {
      storeResume(trackId);
      // Queue will be processed automatically
    },
    [storeResume]
  );

  // Cancel download
  const cancelDownload = useCallback(
    async (trackId: string) => {
      const activeDownload = activeDownloadsRef.current.get(trackId);
      if (activeDownload) {
        try {
          await activeDownload.resumable.pauseAsync();
        } catch {
          // Ignore errors when canceling
        }
        activeDownloadsRef.current.delete(trackId);
      }
      storeCancel(trackId);
      logger.info('[OfflineDownload] Download cancelled', { trackId });
    },
    [storeCancel]
  );

  // Remove download wrapper
  const removeDownload = useCallback(
    async (trackId: string) => {
      await storeRemoveDownload(trackId);
    },
    [storeRemoveDownload]
  );

  // Refresh storage info wrapper
  const refreshStorageInfo = useCallback(async () => {
    await storeRefreshStorageInfo();
  }, [storeRefreshStorageInfo]);

  // Download a track - returns success status and optional error message
  const downloadTrack = useCallback(
    async (track: {
      id: string;
      title: string;
      displayName: string;
      duration: number;
      artworkUrl?: string;
      audioUrl: string;
    }): Promise<{ success: boolean; error?: string }> => {
      // Guard for Expo Go
      if (!isOfflineSupported) {
        logger.debug('[OfflineDownload] Cannot download in Expo Go');
        return { success: false, error: 'EXPO_GO_NOT_SUPPORTED' };
      }

      if (!networkStatus.isConnected) {
        logger.warn('[OfflineDownload] Cannot download while offline');
        return { success: false, error: 'OFFLINE' };
      }

      try {
        await addToQueue(track);
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Download failed';
        if (message === 'STORAGE_LIMIT_EXCEEDED') {
          return { success: false, error: 'STORAGE_LIMIT_EXCEEDED' };
        }
        if (message === 'EXPO_GO_NOT_SUPPORTED') {
          return { success: false, error: 'EXPO_GO_NOT_SUPPORTED' };
        }
        return { success: false, error: message };
      }
    },
    [networkStatus.isConnected, addToQueue]
  );

  // Get all completed downloads
  const getCompletedDownloads = useCallback((): OfflineTrack[] => {
    return Object.values(downloads).filter(d => d.status === 'completed');
  }, [downloads]);

  // Get download by trackId
  const getDownload = useCallback(
    (trackId: string): OfflineTrack | undefined => {
      return downloads[trackId];
    },
    [downloads]
  );

  // Check if track has offline version
  const hasOfflineVersion = useCallback(
    (trackId: string): boolean => {
      return isDownloaded(trackId);
    },
    [isDownloaded]
  );

  // Resolve playback URL (local if available, otherwise remote)
  const resolvePlaybackUrl = useCallback(
    (trackId: string, remoteUrl: string): string => {
      const localPath = getLocalAudioPath(trackId);
      if (localPath) {
        // Update last played timestamp
        useDownloadStore.getState().updateLastPlayed(trackId);
        return localPath;
      }
      return remoteUrl;
    },
    [getLocalAudioPath]
  );

  return {
    // State
    downloads,
    queue,
    isProcessing,
    storageInfo,
    isOnline: networkStatus.isConnected,
    isOfflineSupported,

    // Actions
    downloadTrack,
    removeDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    refreshStorageInfo,

    // Helpers
    getCompletedDownloads,
    getDownload,
    hasOfflineVersion,
    resolvePlaybackUrl,
    getLocalAudioPath,
    isDownloaded,
  };
}
