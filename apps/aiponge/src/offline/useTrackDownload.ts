/**
 * Track Download Hook
 * Simplified hook for downloading a single track
 * Wraps useOfflineDownload for easy integration with track components
 */

import { useCallback, useMemo } from 'react';
import { useOfflineDownload } from './useOfflineDownload';
import { isOfflineSupported } from './offlineEnv';
import type { DownloadStatus, OfflineTrack } from './types';

export interface TrackDownloadInfo {
  trackId: string;
  title: string;
  displayName: string;
  duration: number;
  artworkUrl?: string;
  audioUrl: string;
}

export interface TrackDownloadState {
  isDownloaded: boolean;
  isDownloading: boolean;
  isPaused: boolean;
  isFailed: boolean;
  progress: number;
  status: DownloadStatus | null;
  localAudioPath?: string;
}

export interface UseTrackDownloadReturn {
  // State
  state: TrackDownloadState;
  isOfflineSupported: boolean;

  // Actions
  startDownload: () => Promise<void>;
  pauseDownload: () => void;
  resumeDownload: () => void;
  cancelDownload: () => void;
  removeDownload: () => Promise<void>;

  // Helpers
  getPlaybackUrl: (remoteUrl: string) => string;
}

export function useTrackDownload(track: TrackDownloadInfo | null): UseTrackDownloadReturn {
  const offlineDownload = useOfflineDownload();

  const downloadInfo: OfflineTrack | undefined = useMemo(() => {
    if (!track) return undefined;
    return offlineDownload.getDownload?.(track.trackId);
  }, [track, offlineDownload]);

  const state: TrackDownloadState = useMemo(() => {
    if (!downloadInfo) {
      return {
        isDownloaded: false,
        isDownloading: false,
        isPaused: false,
        isFailed: false,
        progress: 0,
        status: null,
        localAudioPath: undefined,
      };
    }

    return {
      isDownloaded: downloadInfo.status === 'completed',
      isDownloading: downloadInfo.status === 'downloading' || downloadInfo.status === 'pending',
      isPaused: downloadInfo.status === 'paused',
      isFailed: downloadInfo.status === 'failed',
      progress: downloadInfo.progress,
      status: downloadInfo.status,
      localAudioPath: downloadInfo.localAudioPath,
    };
  }, [downloadInfo]);

  const startDownload = useCallback(async () => {
    if (!track || !isOfflineSupported) return;

    await offlineDownload.downloadTrack({
      id: track.trackId,
      title: track.title,
      displayName: track.displayName,
      duration: track.duration,
      artworkUrl: track.artworkUrl,
      audioUrl: track.audioUrl,
    });
  }, [track, offlineDownload]);

  const pauseDownload = useCallback(() => {
    if (!track) return;
    offlineDownload.pauseDownload(track.trackId);
  }, [track, offlineDownload]);

  const resumeDownload = useCallback(() => {
    if (!track) return;
    offlineDownload.resumeDownload(track.trackId);
  }, [track, offlineDownload]);

  const cancelDownload = useCallback(() => {
    if (!track) return;
    offlineDownload.cancelDownload(track.trackId);
  }, [track, offlineDownload]);

  const removeDownload = useCallback(async () => {
    if (!track) return;
    await offlineDownload.removeDownload(track.trackId);
  }, [track, offlineDownload]);

  const getPlaybackUrl = useCallback(
    (remoteUrl: string): string => {
      if (!track) return remoteUrl;
      return offlineDownload.resolvePlaybackUrl(track.trackId, remoteUrl);
    },
    [track, offlineDownload]
  );

  return {
    state,
    isOfflineSupported,
    startDownload,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    removeDownload,
    getPlaybackUrl,
  };
}
