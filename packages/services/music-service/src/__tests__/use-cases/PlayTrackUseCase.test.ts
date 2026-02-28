import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
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

import {
  PlayTrackUseCase,
  type IPlaybackSessionRepository,
} from '../../application/use-cases/streaming/PlayTrackUseCase';
import {
  PlaybackSessionEntity,
  PlaybackMode,
  RepeatMode,
  PlaybackState,
  StreamQuality,
  StreamType,
} from '../../domains/music-catalog/entities/PlaybackSession';
import { StreamingError } from '../../application/errors';

describe('PlayTrackUseCase', () => {
  let useCase: PlayTrackUseCase;
  let mockSessionRepo: IPlaybackSessionRepository;
  let mockGetStreamUrlUseCase: Record<string, ReturnType<typeof vi.fn>>;
  let mockAudioClient: Record<string, ReturnType<typeof vi.fn>>;

  const mockStreamData = {
    trackId: 'track-1',
    selectedQuality: StreamQuality.MEDIUM,
    streamUrl: 'https://cdn.example.com/track-1.mp3',
    cdnUrl: 'https://cdn2.example.com/track-1.mp3',
    bitrate: 192,
    format: 'mp3',
    fileSize: 3145728,
    availableQualities: [StreamQuality.HIGH, StreamQuality.MEDIUM, StreamQuality.LOW],
    fallbackUsed: false,
    message: 'Track started successfully',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionRepo = {
      save: vi.fn(),
      findByUserId: vi.fn(),
      findBySessionId: vi.fn(),
      deleteBySessionId: vi.fn(),
    };
    mockGetStreamUrlUseCase = {
      execute: vi.fn().mockResolvedValue(mockStreamData),
    };
    mockAudioClient = {
      getTrackMetadata: vi.fn().mockResolvedValue({ duration: 180 }),
    };
    useCase = new PlayTrackUseCase(mockSessionRepo, mockGetStreamUrlUseCase, mockAudioClient);
  });

  describe('Happy path', () => {
    it('should create a new session when none exists', async () => {
      vi.mocked(mockSessionRepo.findByUserId).mockResolvedValue(null);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({
        userId: 'user-1',
        trackId: 'track-1',
        deviceId: 'device-1',
      });

      expect(result.trackId).toBe('track-1');
      expect(result.state).toBe(PlaybackState.PLAYING);
      expect(result.streamUrl).toBeTruthy();
      expect(mockSessionRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        currentTrackId: 'track-1',
        deviceId: 'device-1',
      }));
    });

    it('should reuse existing session', async () => {
      const existingSession = PlaybackSessionEntity.create({
        userId: 'user-1',
        deviceId: 'device-1',
        currentTrackId: 'track-old',
        duration: 0,
        volume: 80,
        mode: PlaybackMode.NORMAL,
        repeat: RepeatMode.NONE,
        quality: StreamQuality.MEDIUM,
        type: StreamType.ON_DEMAND,
        availableQualities: [],
      });
      vi.mocked(mockSessionRepo.findByUserId).mockResolvedValue(existingSession);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({
        userId: 'user-1',
        trackId: 'track-1',
        deviceId: 'device-1',
      });

      expect(result.trackId).toBe('track-1');
      expect(result.state).toBe(PlaybackState.PLAYING);
    });

    it('should load queue when provided', async () => {
      vi.mocked(mockSessionRepo.findByUserId).mockResolvedValue(null);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({
        userId: 'user-1',
        trackId: 'track-2',
        deviceId: 'device-1',
        queueTrackIds: ['track-1', 'track-2', 'track-3'],
        startIndex: 1,
      });

      expect(result.queueLength).toBe(3);
      expect(result.currentIndex).toBe(1);
    });

    it('should apply playback preferences', async () => {
      vi.mocked(mockSessionRepo.findByUserId).mockResolvedValue(null);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({
        userId: 'user-1',
        trackId: 'track-1',
        deviceId: 'device-1',
        mode: PlaybackMode.SHUFFLE,
        repeat: RepeatMode.ALL,
        quality: StreamQuality.HIGH,
      });

      expect(result.repeat).toBe(RepeatMode.ALL);
    });

    it('should seek to position when specified', async () => {
      vi.mocked(mockSessionRepo.findByUserId).mockResolvedValue(null);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({
        userId: 'user-1',
        trackId: 'track-1',
        deviceId: 'device-1',
        position: 30,
      });

      expect(result.position).toBe(30);
    });
  });

  describe('Service failures', () => {
    it('should throw StreamingError when stream URL fetch fails', async () => {
      vi.mocked(mockSessionRepo.findByUserId).mockResolvedValue(null);
      mockGetStreamUrlUseCase.execute.mockRejectedValue(new Error('Service down'));

      await expect(useCase.execute({
        userId: 'user-1',
        trackId: 'track-1',
        deviceId: 'device-1',
      })).rejects.toThrow(StreamingError);
    });

    it('should throw StreamingError when audio metadata fails', async () => {
      vi.mocked(mockSessionRepo.findByUserId).mockResolvedValue(null);
      mockAudioClient.getTrackMetadata.mockRejectedValue(new Error('Metadata unavailable'));

      await expect(useCase.execute({
        userId: 'user-1',
        trackId: 'track-1',
        deviceId: 'device-1',
      })).rejects.toThrow(StreamingError);
    });

    it('should throw StreamingError when session save fails', async () => {
      vi.mocked(mockSessionRepo.findByUserId).mockResolvedValue(null);
      vi.mocked(mockSessionRepo.save).mockRejectedValue(new Error('DB error'));

      await expect(useCase.execute({
        userId: 'user-1',
        trackId: 'track-1',
        deviceId: 'device-1',
      })).rejects.toThrow(StreamingError);
    });
  });
});
