/**
 * Offline Environment Module
 * Provides expo-file-system with safe stubs as fallback.
 */

import { logger } from '../lib/logger';

export const isOfflineSupported = true;

// FileSystem stub types matching expo-file-system
interface FileInfo {
  exists: boolean;
  uri?: string;
  size?: number;
  isDirectory?: boolean;
  modificationTime?: number;
}

interface DownloadResult {
  uri: string;
  status: number;
  headers: Record<string, string>;
  mimeType: string | null;
  md5?: string;
}

interface DownloadProgressData {
  totalBytesWritten: number;
  totalBytesExpectedToWrite: number;
}

type DownloadProgressCallback = (data: DownloadProgressData) => void;

interface DownloadResumable {
  downloadAsync: () => Promise<DownloadResult | undefined>;
  pauseAsync: () => Promise<DownloadProgressData>;
  resumeAsync: () => Promise<DownloadResult | undefined>;
  savable: () => { url: string; fileUri: string; resumeData?: string };
}

interface FileSystemInterface {
  documentDirectory: string | null;
  cacheDirectory: string | null;
  getInfoAsync: (fileUri: string, options?: { size?: boolean }) => Promise<FileInfo>;
  readDirectoryAsync: (dirUri: string) => Promise<string[]>;
  makeDirectoryAsync: (dirUri: string, options?: { intermediates?: boolean }) => Promise<void>;
  deleteAsync: (fileUri: string, options?: { idempotent?: boolean }) => Promise<void>;
  downloadAsync: (uri: string, fileUri: string, options?: object) => Promise<DownloadResult>;
  createDownloadResumable: (
    uri: string,
    fileUri: string,
    options?: object,
    callback?: DownloadProgressCallback,
    resumeData?: string
  ) => DownloadResumable;
  getFreeDiskStorageAsync: () => Promise<number>;
  getTotalDiskCapacityAsync: () => Promise<number>;
}

// Stub implementation (fallback if native module fails to load)
const fileSystemStub: FileSystemInterface = {
  documentDirectory: null,
  cacheDirectory: null,
  getInfoAsync: async () => ({ exists: false }),
  readDirectoryAsync: async () => [],
  makeDirectoryAsync: async () => {},
  deleteAsync: async () => {},
  downloadAsync: async () => ({
    uri: '',
    status: 0,
    headers: {},
    mimeType: null,
  }),
  createDownloadResumable: () => ({
    downloadAsync: async () => undefined,
    pauseAsync: async () => ({ totalBytesWritten: 0, totalBytesExpectedToWrite: 0 }),
    resumeAsync: async () => undefined,
    savable: () => ({ url: '', fileUri: '' }),
  }),
  getFreeDiskStorageAsync: async () => 0,
  getTotalDiskCapacityAsync: async () => 0,
};

// Dynamic module loading with fallback to stub
let FileSystem: FileSystemInterface = fileSystemStub;

try {
  const fs = require('expo-file-system');
  FileSystem = fs as FileSystemInterface;
  logger.info('[offlineEnv] Loaded expo-file-system module');
} catch (error) {
  logger.warn('[offlineEnv] Failed to load expo-file-system, using stub', { error });
}

export { FileSystem };

// Helper to get offline directory path
export function getOfflineDirectory(): string | null {
  if (!isOfflineSupported || !FileSystem.documentDirectory) {
    return null;
  }
  return `${FileSystem.documentDirectory}offline/`;
}

// Helper to check if we can perform offline operations
export function canPerformOfflineOperations(): boolean {
  return isOfflineSupported && FileSystem.documentDirectory !== null;
}
