import { randomUUID } from 'crypto';

export function createMockUser(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    email: `user-${Date.now()}@test.com`,
    displayName: 'Test User',
    role: 'member',
    subscriptionTier: 'explorer',
    status: 'active',
    isGuest: false,
    phoneVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    title: 'Test Entry',
    content: 'Test entry content for wellness journaling.',
    mood: 'neutral',
    tags: ['test', 'wellness'],
    visibility: 'personal',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockBook(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    title: 'Test Book',
    description: 'A test book',
    entries: [],
    coverArtworkUrl: 'https://storage.test.com/covers/test.jpg',
    status: 'draft',
    bookType: 'journal',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockAlbum(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    title: 'Test Album',
    description: 'A test album',
    genres: ['ambient'],
    tracks: [],
    coverArtUrl: 'https://storage.test.com/covers/album.jpg',
    status: 'completed',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockTrack(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    albumId: randomUUID(),
    title: 'Test Track',
    audioUrl: 'https://storage.test.com/audio/track.mp3',
    duration: 180,
    lyrics: 'Test lyrics line 1\nTest lyrics line 2',
    status: 'completed',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockPlaylist(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    name: 'Test Playlist',
    description: 'A test playlist',
    trackIds: [],
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createMockStorageFile(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    userId: randomUUID(),
    fileName: 'test-file.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    url: 'https://storage.test.com/files/test-file.jpg',
    bucket: 'default',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
