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

import { GetOptimizedStreamUrlUseCase } from '../../application/use-cases/streaming/GetOptimizedStreamUrlUseCase';
import { StreamQuality } from '../../domains/music-catalog/entities/PlaybackSession';
import { StreamingError } from '../../application/errors';

describe('GetOptimizedStreamUrlUseCase', () => {
  let useCase: GetOptimizedStreamUrlUseCase;
  let mockAudioClient: Record<string, ReturnType<typeof vi.fn>>;

  const mockOptimizedUrl = {
    url: 'https://cdn.example.com/stream/track-1.mp3',
    cdnUrl: 'https://cdn2.example.com/track-1.mp3',
    bitrate: 320,
    format: 'mp3',
    fileSize: 5242880,
    expiresAt: new Date('2025-12-31'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudioClient = {
      isTrackReady: vi.fn(),
      getAvailableQualities: vi.fn(),
      getOptimizedStreamUrl: vi.fn(),
      recordTrackAccess: vi.fn(),
    };
    useCase = new GetOptimizedStreamUrlUseCase(mockAudioClient);
  });

  describe('Happy path', () => {
    it('should return optimized stream URL for preferred quality', async () => {
      mockAudioClient.isTrackReady.mockResolvedValue(true);
      mockAudioClient.getAvailableQualities.mockResolvedValue(['high', 'medium', 'low']);
      mockAudioClient.getOptimizedStreamUrl.mockResolvedValue(mockOptimizedUrl);
      mockAudioClient.recordTrackAccess.mockResolvedValue(undefined);

      const result = await useCase.execute({
        trackId: 'track-1',
        preferredQuality: StreamQuality.HIGH,
        userId: 'user-1',
      });

      expect(result.trackId).toBe('track-1');
      expect(result.streamUrl).toBe(mockOptimizedUrl.url);
      expect(result.bitrate).toBe(320);
      expect(result.format).toBe('mp3');
    });

    it('should fallback to lower quality when preferred not available', async () => {
      mockAudioClient.isTrackReady.mockResolvedValue(true);
      mockAudioClient.getAvailableQualities.mockResolvedValue(['medium', 'low']);
      mockAudioClient.getOptimizedStreamUrl.mockResolvedValue(mockOptimizedUrl);

      const result = await useCase.execute({
        trackId: 'track-1',
        preferredQuality: StreamQuality.HIGH,
        fallbackToLower: true,
      });

      expect(result.fallbackUsed).toBe(true);
    });

    it('should work without userId (no analytics recording)', async () => {
      mockAudioClient.isTrackReady.mockResolvedValue(true);
      mockAudioClient.getAvailableQualities.mockResolvedValue(['medium']);
      mockAudioClient.getOptimizedStreamUrl.mockResolvedValue(mockOptimizedUrl);

      const result = await useCase.execute({
        trackId: 'track-1',
        preferredQuality: StreamQuality.MEDIUM,
      });

      expect(result.streamUrl).toBe(mockOptimizedUrl.url);
      expect(mockAudioClient.recordTrackAccess).not.toHaveBeenCalled();
    });
  });

  describe('Not found / unavailable', () => {
    it('should throw when track is not ready for streaming', async () => {
      mockAudioClient.isTrackReady.mockResolvedValue(false);

      await expect(
        useCase.execute({
          trackId: 'track-1',
          preferredQuality: StreamQuality.HIGH,
        })
      ).rejects.toThrow(StreamingError);
    });

    it('should throw when no suitable quality is available', async () => {
      mockAudioClient.isTrackReady.mockResolvedValue(true);
      mockAudioClient.getAvailableQualities.mockResolvedValue([]);

      await expect(
        useCase.execute({
          trackId: 'track-1',
          preferredQuality: StreamQuality.LOSSLESS,
          fallbackToLower: false,
        })
      ).rejects.toThrow(StreamingError);
    });
  });

  describe('Service failures', () => {
    it('should throw StreamingError when audio client fails', async () => {
      mockAudioClient.isTrackReady.mockRejectedValue(new Error('Service timeout'));

      await expect(
        useCase.execute({
          trackId: 'track-1',
          preferredQuality: StreamQuality.HIGH,
        })
      ).rejects.toThrow(StreamingError);
    });

    it('should not fail when analytics recording fails', async () => {
      mockAudioClient.isTrackReady.mockResolvedValue(true);
      mockAudioClient.getAvailableQualities.mockResolvedValue(['high']);
      mockAudioClient.getOptimizedStreamUrl.mockResolvedValue(mockOptimizedUrl);
      mockAudioClient.recordTrackAccess.mockRejectedValue(new Error('Analytics failed'));

      const result = await useCase.execute({
        trackId: 'track-1',
        preferredQuality: StreamQuality.HIGH,
        userId: 'user-1',
      });

      expect(result.streamUrl).toBe(mockOptimizedUrl.url);
    });
  });
});
