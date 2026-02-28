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

const mockGenerateAlbumArtwork = vi.fn();
vi.mock('@infrastructure/clients/AIContentServiceClient', () => {
  return {
    AIContentServiceClient: class {
      generateAlbumArtwork = mockGenerateAlbumArtwork;
    },
  };
});

vi.mock('@aiponge/shared-contracts', () => ({
  CONTENT_VISIBILITY: {
    PERSONAL: 'personal',
    SHARED: 'shared',
  },
}));

import {
  GenerateArtworkUseCase,
  type GenerateArtworkRequest,
} from '../../application/use-cases/music/GenerateArtworkUseCase';

describe('GenerateArtworkUseCase', () => {
  let useCase: GenerateArtworkUseCase;

  const validRequest: GenerateArtworkRequest = {
    lyrics: 'Some song lyrics here',
    title: 'Test Song',
    style: 'abstract',
    genre: 'pop',
    mood: 'happy',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new GenerateArtworkUseCase();
  });

  describe('Happy path', () => {
    it('should generate artwork successfully', async () => {
      mockGenerateAlbumArtwork.mockResolvedValue({
        success: true,
        artworkUrl: 'https://cdn.example.com/artwork/generated.jpg',
        revisedPrompt: 'A beautiful abstract artwork',
        templateUsed: 'album-art-v2',
      });

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(true);
      expect(result.artworkUrl).toBe('https://cdn.example.com/artwork/generated.jpg');
      expect(result.revisedPrompt).toBe('A beautiful abstract artwork');
      expect(result.templateUsed).toBe('album-art-v2');
      expect(result.processingTimeMs).toBeDefined();
    });

    it('should pass all request fields to client', async () => {
      mockGenerateAlbumArtwork.mockResolvedValue({
        success: true,
        artworkUrl: 'https://cdn.example.com/art.jpg',
      });

      await useCase.execute(validRequest);

      expect(mockGenerateAlbumArtwork).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Song',
          lyrics: 'Some song lyrics here',
          style: 'abstract',
          genre: 'pop',
          mood: 'happy',
          userId: 'user-1',
        })
      );
    });
  });

  describe('Service failures', () => {
    it('should return failure when client returns unsuccessful result', async () => {
      mockGenerateAlbumArtwork.mockResolvedValue({
        success: false,
        error: 'Content policy violation',
      });

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Content policy violation');
    });

    it('should return failure when client returns success but no URL', async () => {
      mockGenerateAlbumArtwork.mockResolvedValue({
        success: true,
        artworkUrl: undefined,
      });

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(false);
    });

    it('should handle client exceptions gracefully', async () => {
      mockGenerateAlbumArtwork.mockRejectedValue(new Error('Network timeout'));

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(result.processingTimeMs).toBeDefined();
    });

    it('should handle non-Error exceptions', async () => {
      mockGenerateAlbumArtwork.mockRejectedValue('unexpected failure');

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown');
    });
  });
});
