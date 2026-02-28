import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));
vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  DomainError: class DomainError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number = 500, cause?: Error) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('@config/service-urls', () => ({
  getLogger: () => mockLogger,
}));

const mockGeneratePlaylistArtwork = vi.fn();
vi.mock('@infrastructure/clients/AIContentServiceClient', () => {
  return {
    AIContentServiceClient: class {
      generatePlaylistArtwork = mockGeneratePlaylistArtwork;
    },
  };
});

import {
  GeneratePlaylistArtworkUseCase,
  type GeneratePlaylistArtworkRequest,
} from '../../application/use-cases/music/GeneratePlaylistArtworkUseCase';

describe('GeneratePlaylistArtworkUseCase', () => {
  let useCase: GeneratePlaylistArtworkUseCase;

  const validRequest: GeneratePlaylistArtworkRequest = {
    playlistName: 'My Chill Playlist',
    description: 'Relaxing tracks for evening',
    mood: 'calm',
    genre: 'ambient',
    trackCount: 15,
    playlistId: 'playlist-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new GeneratePlaylistArtworkUseCase();
  });

  describe('Happy path', () => {
    it('should generate playlist artwork successfully', async () => {
      mockGeneratePlaylistArtwork.mockResolvedValue({
        success: true,
        artworkUrl: 'https://cdn.example.com/playlist-art.jpg',
        revisedPrompt: 'A calm ambient playlist cover',
      });

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(true);
      expect(result.artworkUrl).toBe('https://cdn.example.com/playlist-art.jpg');
      expect(result.revisedPrompt).toBe('A calm ambient playlist cover');
      expect(result.processingTimeMs).toBeDefined();
    });

    it('should pass all fields to the client', async () => {
      mockGeneratePlaylistArtwork.mockResolvedValue({
        success: true,
        artworkUrl: 'https://cdn.example.com/art.jpg',
      });

      await useCase.execute(validRequest);

      expect(mockGeneratePlaylistArtwork).toHaveBeenCalledWith(
        expect.objectContaining({
          playlistName: 'My Chill Playlist',
          description: 'Relaxing tracks for evening',
          mood: 'calm',
          genre: 'ambient',
          trackCount: 15,
          playlistId: 'playlist-1',
        })
      );
    });

    it('should work with minimal request (only required fields)', async () => {
      mockGeneratePlaylistArtwork.mockResolvedValue({
        success: true,
        artworkUrl: 'https://cdn.example.com/art.jpg',
      });

      const result = await useCase.execute({
        playlistName: 'Simple Playlist',
        playlistId: 'playlist-2',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Service failures', () => {
    it('should return failure when client returns unsuccessful', async () => {
      mockGeneratePlaylistArtwork.mockResolvedValue({
        success: false,
        error: 'Rate limit exceeded',
      });

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rate limit exceeded');
    });

    it('should return failure when success but no artwork URL', async () => {
      mockGeneratePlaylistArtwork.mockResolvedValue({
        success: true,
        artworkUrl: undefined,
      });

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(false);
    });

    it('should handle client exceptions gracefully', async () => {
      mockGeneratePlaylistArtwork.mockRejectedValue(new Error('Service unavailable'));

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Service unavailable');
    });

    it('should handle non-Error exceptions', async () => {
      mockGeneratePlaylistArtwork.mockRejectedValue('unknown error');

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown');
    });
  });
});
