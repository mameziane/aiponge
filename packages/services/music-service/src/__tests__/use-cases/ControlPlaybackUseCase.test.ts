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
  ControlPlaybackUseCase,
  type IPlaybackSessionRepository,
} from '../../application/use-cases/streaming/ControlPlaybackUseCase';
import {
  PlaybackSessionEntity,
  PlaybackMode,
  RepeatMode,
  PlaybackState,
  StreamQuality,
  StreamType,
} from '../../domains/music-catalog/entities/PlaybackSession';
import { StreamingError } from '../../application/errors';

describe('ControlPlaybackUseCase', () => {
  let useCase: ControlPlaybackUseCase;
  let mockSessionRepo: IPlaybackSessionRepository;
  let mockGetStreamUrlUseCase: Record<string, ReturnType<typeof vi.fn>>;
  let mockAudioClient: Record<string, ReturnType<typeof vi.fn>>;

  const createSession = () => {
    const session = PlaybackSessionEntity.create({
      userId: 'user-1',
      deviceId: 'device-1',
      currentTrackId: 'track-1',
      duration: 180,
      volume: 80,
      mode: PlaybackMode.NORMAL,
      repeat: RepeatMode.NONE,
      quality: StreamQuality.MEDIUM,
      type: StreamType.ON_DEMAND,
      availableQualities: [StreamQuality.HIGH, StreamQuality.MEDIUM, StreamQuality.LOW],
    });
    session.loadQueue(['track-1', 'track-2', 'track-3'], 0);
    return session;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionRepo = {
      findBySessionId: vi.fn(),
      save: vi.fn(),
    };
    mockGetStreamUrlUseCase = {
      execute: vi.fn(),
    };
    mockAudioClient = {
      getTrackMetadata: vi.fn(),
    };
    useCase = new ControlPlaybackUseCase(mockSessionRepo, mockGetStreamUrlUseCase, mockAudioClient);
  });

  describe('Happy path - basic controls', () => {
    it('should handle play action', async () => {
      const session = createSession();
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(session);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({ sessionId: session.id, action: 'play' });

      expect(result.state).toBe(PlaybackState.PLAYING);
      expect(result.message).toBe('Playback started');
    });

    it('should handle pause action', async () => {
      const session = createSession();
      session.play();
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(session);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({ sessionId: session.id, action: 'pause' });

      expect(result.state).toBe(PlaybackState.PAUSED);
      expect(result.message).toBe('Playback paused');
    });

    it('should handle stop action', async () => {
      const session = createSession();
      session.play();
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(session);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({ sessionId: session.id, action: 'stop' });

      expect(result.state).toBe(PlaybackState.STOPPED);
      expect(result.message).toBe('Playback stopped');
    });

    it('should handle seek action', async () => {
      const session = createSession();
      session.play();
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(session);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({ sessionId: session.id, action: 'seek', position: 60 });

      expect(result.position).toBe(60);
    });

    it('should handle volume action', async () => {
      const session = createSession();
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(session);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({ sessionId: session.id, action: 'volume', volume: 50 });

      expect(result.volume).toBe(50);
    });
  });

  describe('Happy path - navigation', () => {
    it('should handle next action with track change', async () => {
      const session = createSession();
      session.play();
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(session);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);
      mockGetStreamUrlUseCase.execute.mockResolvedValue({
        streamUrl: 'https://cdn.example.com/track-2.mp3',
        selectedQuality: StreamQuality.MEDIUM,
        cdnUrl: 'https://cdn2.example.com/track-2.mp3',
      });
      mockAudioClient.getTrackMetadata.mockResolvedValue({ duration: 200 });

      const result = await useCase.execute({ sessionId: session.id, action: 'next' });

      expect(result.trackChanged).toBe(true);
      expect(result.trackId).toBe('track-2');
    });
  });

  describe('Happy path - mode controls', () => {
    it('should toggle shuffle mode', async () => {
      const session = createSession();
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(session);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({ sessionId: session.id, action: 'shuffle' });

      expect(result.mode).toBe(PlaybackMode.SHUFFLE);
    });

    it('should cycle repeat modes', async () => {
      const session = createSession();
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(session);
      vi.mocked(mockSessionRepo.save).mockResolvedValue(undefined);

      const result = await useCase.execute({ sessionId: session.id, action: 'repeat' });

      expect(result.repeat).toBe(RepeatMode.ALL);
    });
  });

  describe('Validation errors', () => {
    it('should throw when seek without position', async () => {
      const session = createSession();
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(session);

      await expect(useCase.execute({ sessionId: session.id, action: 'seek' })).rejects.toThrow(StreamingError);
    });

    it('should throw when volume without value', async () => {
      const session = createSession();
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(session);

      await expect(useCase.execute({ sessionId: session.id, action: 'volume' })).rejects.toThrow(StreamingError);
    });

    it('should throw for invalid action', async () => {
      const session = createSession();
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(session);

      await expect(useCase.execute({ sessionId: session.id, action: 'invalid' as unknown as string })).rejects.toThrow(StreamingError);
    });
  });

  describe('Not found', () => {
    it('should throw when session not found', async () => {
      vi.mocked(mockSessionRepo.findBySessionId).mockResolvedValue(null);

      await expect(useCase.execute({ sessionId: 'nonexistent', action: 'play' })).rejects.toThrow(StreamingError);
    });
  });

  describe('Service failures', () => {
    it('should throw StreamingError on repository failure', async () => {
      vi.mocked(mockSessionRepo.findBySessionId).mockRejectedValue(new Error('DB error'));

      await expect(useCase.execute({ sessionId: 'session-1', action: 'play' })).rejects.toThrow(StreamingError);
    });
  });
});
