import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { PlaylistService } from '../application/services/PlaylistService';
import { IPlaylistRepository } from '../infrastructure/database/DrizzlePlaylistRepository';
import type { Playlist } from '../schema/music-schema';

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('@aiponge/platform-core', () => ({
  getLogger: vi.fn(() => mockLogger),
  createLogger: vi.fn(() => mockLogger),
  DomainError: class DomainError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 500) {
      super(message);
      this.name = 'DomainError';
      this.statusCode = statusCode;
    }
  },
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
  ServiceRegistry: {},
  hasService: vi.fn().mockReturnValue(false),
  waitForService: vi.fn(),
  listServices: vi.fn(),
}));

type MockedRepository = {
  [K in keyof IPlaylistRepository]: Mock;
};

describe('PlaylistService', () => {
  let playlistService: PlaylistService;
  let mockPlaylistRepository: MockedRepository;

  beforeEach(() => {
    mockPlaylistRepository = {
      createPlaylist: vi
        .fn()
        .mockImplementation(playlist =>
          Promise.resolve({ ...playlist, createdAt: new Date(), updatedAt: new Date() } as Playlist)
        ),
      getPlaylistById: vi.fn().mockResolvedValue(null),
      getPlaylistsByUser: vi.fn().mockResolvedValue([]),
      updatePlaylist: vi.fn().mockResolvedValue(undefined),
      deletePlaylist: vi.fn().mockResolvedValue(undefined),
      addTrackToPlaylist: vi.fn().mockResolvedValue(undefined),
      removeTrackFromPlaylist: vi.fn().mockResolvedValue(undefined),
      reorderPlaylistTracks: vi.fn().mockResolvedValue(undefined),
      getPlaylistTracks: vi.fn().mockResolvedValue([]),
      followPlaylist: vi.fn().mockResolvedValue(undefined),
      unfollowPlaylist: vi.fn().mockResolvedValue(undefined),
      searchPlaylists: vi.fn().mockResolvedValue([]),
      getPublicPlaylists: vi.fn().mockResolvedValue([]),
      getTrendingPlaylists: vi.fn().mockResolvedValue([]),
    };
    playlistService = new PlaylistService(mockPlaylistRepository as unknown as IPlaylistRepository);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createPlaylist', () => {
    it('should successfully create a playlist', async () => {
      const result = await playlistService.createPlaylist({ name: 'My Playlist', userId: 'user-123' });

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
    });

    it('should generate a valid UUID for playlist ID', async () => {
      const result = await playlistService.createPlaylist({ name: 'Test Playlist', userId: 'user-456' });

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('should handle different playlist names', async () => {
      const names = ['Rock Classics', 'Jazz Favorites', 'Workout Mix', '🎵 Music'];

      for (const name of names) {
        const result = await playlistService.createPlaylist({ name, userId: 'user-789' });
        expect(result).toBeDefined();
        expect(result.id).toBeDefined();
      }
    });

    it('should handle different user IDs', async () => {
      const result1 = await playlistService.createPlaylist({ name: 'Playlist 1', userId: 'user-1' });
      const result2 = await playlistService.createPlaylist({ name: 'Playlist 2', userId: 'user-2' });

      expect(result1.id).not.toBe(result2.id);
    });

    it('should generate unique IDs for multiple playlists', async () => {
      const result1 = await playlistService.createPlaylist({ name: 'Playlist A', userId: 'user-100' });
      const result2 = await playlistService.createPlaylist({ name: 'Playlist B', userId: 'user-100' });
      const result3 = await playlistService.createPlaylist({ name: 'Playlist C', userId: 'user-100' });

      const ids = [result1.id, result2.id, result3.id];
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it('should pass metadata fields to repository', async () => {
      const result = await playlistService.createPlaylist({
        name: 'Chill Vibes',
        userId: 'user-300',
        mood: 'relaxed',
        genre: 'ambient',
        category: 'wellness',
        icon: '🧘',
        color: '#4A90D9',
        tags: ['meditation', 'calm'],
        playlistType: 'smart',
      });

      expect(result).toBeDefined();
      expect(mockPlaylistRepository.createPlaylist).toHaveBeenCalledWith(
        expect.objectContaining({
          mood: 'relaxed',
          genre: 'ambient',
          category: 'wellness',
          icon: '🧘',
          color: '#4A90D9',
          tags: ['meditation', 'calm'],
          playlistType: 'smart',
        })
      );
    });

    it('should default playlistType to manual', async () => {
      await playlistService.createPlaylist({ name: 'Default Type', userId: 'user-400' });

      expect(mockPlaylistRepository.createPlaylist).toHaveBeenCalledWith(
        expect.objectContaining({ playlistType: 'manual' })
      );
    });
  });

  describe('getPlaylist', () => {
    it('should return playlist data when found', async () => {
      const playlistId = 'test-playlist-id';
      const mockPlaylist = { id: playlistId, name: 'Test Playlist', userId: 'user-1' } as Playlist;
      mockPlaylistRepository.getPlaylistById.mockResolvedValue(mockPlaylist);

      const result = await playlistService.getPlaylist(playlistId);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('name');
    });

    it('should return correct playlist ID', async () => {
      const playlistId = 'custom-id-123';
      const mockPlaylist = { id: playlistId, name: 'Test', userId: 'user-1' } as Playlist;
      mockPlaylistRepository.getPlaylistById.mockResolvedValue(mockPlaylist);

      const result = await playlistService.getPlaylist(playlistId);

      expect(result?.id).toBe(playlistId);
    });

    it('should return null when playlist not found', async () => {
      mockPlaylistRepository.getPlaylistById.mockResolvedValue(null);

      const result = await playlistService.getPlaylist('non-existent');

      expect(result).toBeNull();
    });

    it('should call repository with correct ID', async () => {
      const playlistId = 'test-id';
      mockPlaylistRepository.getPlaylistById.mockResolvedValue(null);

      await playlistService.getPlaylist(playlistId);

      expect(mockPlaylistRepository.getPlaylistById).toHaveBeenCalledWith(playlistId);
    });
  });

  describe('updatePlaylist', () => {
    it('should propagate errors from repository', async () => {
      mockPlaylistRepository.updatePlaylist.mockRejectedValue(new Error('DB connection lost'));

      await expect(playlistService.updatePlaylist('pl-1', { name: 'New Name' })).rejects.toThrow('DB connection lost');
    });
  });

  describe('deletePlaylist', () => {
    it('should propagate errors from repository', async () => {
      mockPlaylistRepository.deletePlaylist.mockRejectedValue(new Error('DB connection lost'));

      await expect(playlistService.deletePlaylist('pl-1')).rejects.toThrow('DB connection lost');
    });
  });

  describe('Service Integration', () => {
    it('should create and retrieve playlist', async () => {
      const playlist = await playlistService.createPlaylist({ name: 'Test Playlist', userId: 'user-999' });

      mockPlaylistRepository.getPlaylistById.mockResolvedValue({
        id: playlist.id,
        name: 'Test Playlist',
        userId: 'user-999',
      } as Playlist);

      const getResult = await playlistService.getPlaylist(playlist.id);
      expect(getResult).toBeDefined();
      expect(getResult?.id).toBe(playlist.id);
    });

    it('should handle multiple operations', async () => {
      const create1 = await playlistService.createPlaylist({ name: 'Playlist 1', userId: 'user-1000' });
      const create2 = await playlistService.createPlaylist({ name: 'Playlist 2', userId: 'user-1000' });

      mockPlaylistRepository.getPlaylistById
        .mockResolvedValueOnce({ id: create1.id, name: 'Playlist 1', userId: 'user-1000' } as Playlist)
        .mockResolvedValueOnce({ id: create2.id, name: 'Playlist 2', userId: 'user-1000' } as Playlist);

      const get1 = await playlistService.getPlaylist(create1.id);
      const get2 = await playlistService.getPlaylist(create2.id);

      expect(get1?.id).toBe(create1.id);
      expect(get2?.id).toBe(create2.id);
    });
  });
});
