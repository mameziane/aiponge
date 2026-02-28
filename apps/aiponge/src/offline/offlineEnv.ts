/**
 * Offline Environment Module
 * Handles Expo Go detection and provides safe stubs for expo-file-system
 *
 * Environment Detection:
 * - Expo Go: Uses stub implementations (native FileSystem modules not available)
 * - Development Build: Uses expo-file-system for real file operations
 */

import Constants from 'expo-constants';
import { logger } from '../lib/logger';

// Detect Expo Go environment
export const isExpoGo = Constants.appOwnership === 'expo';
export const isOfflineSupported = !isExpoGo;
export const disableMessage =
  'Offline downloads require a development build. This feature is not available in Expo Go.';

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

// Stub implementation for Expo Go (native FileSystem not available)
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

// Dynamic module loading with Expo Go protection
let FileSystem: FileSystemInterface = fileSystemStub;

if (isOfflineSupported) {
  try {
    const fs = require('expo-file-system');
    FileSystem = fs as FileSystemInterface;
    logger.info('[offlineEnv] Loaded expo-file-system module');
  } catch (error) {
    logger.warn('[offlineEnv] Failed to load expo-file-system, using stub', { error });
  }
} else {
  logger.info('[offlineEnv] Running in Expo Go - offline downloads require development build');
}

export { FileSystem };

// Helper to get offline directory path (returns null in Expo Go)
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
