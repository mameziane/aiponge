import { vi } from 'vitest';

export function createMockMusicServiceClient() {
  return {
    generateMusic: vi.fn(),
    getTrack: vi.fn(),
    getAlbum: vi.fn(),
    getTracks: vi.fn(),
    getAlbums: vi.fn(),
    createPlaylist: vi.fn(),
    getPlaylist: vi.fn(),
    getPlaylists: vi.fn(),
    updatePlaylist: vi.fn(),
    deletePlaylist: vi.fn(),
    addTrackToPlaylist: vi.fn(),
    removeTrackFromPlaylist: vi.fn(),
    getStreamingSession: vi.fn(),
    createStreamingSession: vi.fn(),
    getLibrary: vi.fn(),
    addToLibrary: vi.fn(),
    removeFromLibrary: vi.fn(),
    searchTracks: vi.fn(),
    getGenres: vi.fn(),
  };
}

export function createMockStorageServiceClient() {
  return {
    uploadFile: vi.fn(),
    downloadFile: vi.fn(),
    deleteFile: vi.fn(),
    generateSignedUrl: vi.fn(),
    getMetadata: vi.fn(),
    getFile: vi.fn(),
    listFiles: vi.fn(),
  };
}

export function createMockUserServiceClient() {
  return {
    getUser: vi.fn(),
    getUserById: vi.fn(),
    updateUser: vi.fn(),
    getSubscription: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    checkCredits: vi.fn(),
    deductCredits: vi.fn(),
  };
}

export function createMockContentServiceClient() {
  return {
    generateContent: vi.fn(),
    getTemplate: vi.fn(),
    getTemplates: vi.fn(),
    analyzeText: vi.fn(),
    getFrameworks: vi.fn(),
  };
}

export function createMockAnalyticsServiceClient() {
  return {
    recordEvent: vi.fn(),
    getMetrics: vi.fn(),
    getTraces: vi.fn(),
  };
}
