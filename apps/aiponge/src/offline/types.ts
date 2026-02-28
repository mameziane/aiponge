/**
 * Offline Download Types
 * Type definitions for offline download management
 */

export type DownloadStatus =
  | 'pending' // Queued for download
  | 'downloading' // Currently downloading
  | 'paused' // Download paused by user
  | 'completed' // Successfully downloaded
  | 'failed' // Download failed
  | 'expired'; // Download expired (subscription lapsed)

export interface OfflineTrack {
  id: string;
  trackId: string;
  title: string;
  displayName: string;
  duration: number;
  artworkUrl?: string;
  audioUrl: string;
  localAudioPath?: string;
  localArtworkPath?: string;
  status: DownloadStatus;
  progress: number;
  size: number;
  downloadedAt?: number;
  lastPlayedAt?: number;
  expiresAt?: number;
  error?: string;
}

export interface DownloadJob {
  trackId: string;
  track: {
    id: string;
    title: string;
    displayName: string;
    duration: number;
    artworkUrl?: string;
    audioUrl: string;
  };
  priority: number;
  retryCount: number;
  createdAt: number;
}

export interface StorageInfo {
  usedBytes: number;
  totalTracks: number;
  limitBytes: number;
}

export interface DownloadManagerState {
  downloads: Record<string, OfflineTrack>;
  queue: DownloadJob[];
  isProcessing: boolean;
  storageInfo: StorageInfo;
  storageLimit: number;
}

export interface DownloadManagerActions {
  addToQueue: (track: DownloadJob['track']) => Promise<void>;
  removeDownload: (trackId: string) => Promise<void>;
  pauseDownload: (trackId: string) => void;
  resumeDownload: (trackId: string) => void;
  cancelDownload: (trackId: string) => void;
  retryDownload: (trackId: string) => void;
  clearAllDownloads: () => Promise<void>;
  updateProgress: (trackId: string, progress: number) => void;
  setDownloadStatus: (trackId: string, status: DownloadStatus, error?: string) => void;
  setLocalPaths: (trackId: string, audioPath: string, artworkPath?: string) => void;
  updateLastPlayed: (trackId: string) => void;
  setStorageLimit: (limitBytes: number) => void;
  refreshStorageInfo: () => Promise<void>;
  getLocalAudioPath: (trackId: string) => string | undefined;
  isDownloaded: (trackId: string) => boolean;
  loadFromStorage: () => Promise<void>;
}

export type DownloadStore = DownloadManagerState & DownloadManagerActions;
