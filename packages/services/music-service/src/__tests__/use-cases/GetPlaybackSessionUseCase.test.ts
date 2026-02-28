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
  GetPlaybackSessionUseCase,
  type IPlaybackSessionRepository,
} from '../../application/use-cases/streaming/GetPlaybackSessionUseCase';
import { StreamingError } from '../../application/errors';

describe('GetPlaybackSessionUseCase', () => {
  let useCase: GetPlaybackSessionUseCase;
  let mockSessionRepo: IPlaybackSessionRepository;

  const createMockSession = (status: string = 'playing') => ({
    id: 'session-1',
    userId: 'user-1',
    currentTrackId: 'track-1',
    status,
    queue: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionRepo = {
      findById: vi.fn(),
      findActiveByUserId: vi.fn(),
    };
    useCase = new GetPlaybackSessionUseCase(mockSessionRepo);
  });

  describe('Happy path', () => {
    it('should return session by session ID', async () => {
      const session = createMockSession('playing');
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);

      const result = await useCase.execute({ sessionId: 'session-1' });

      expect(result.session).toEqual(session);
      expect(result.isActive).toBe(true);
      expect(result.message).toContain('successfully');
    });

    it('should identify paused session as active', async () => {
      const session = createMockSession('paused');
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);

      const result = await useCase.execute({ sessionId: 'session-1' });

      expect(result.isActive).toBe(true);
    });

    it('should identify stopped session as inactive', async () => {
      const session = createMockSession('stopped');
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);

      const result = await useCase.execute({ sessionId: 'session-1' });

      expect(result.isActive).toBe(false);
    });

    it('should fallback to finding active session by userId', async () => {
      const session = createMockSession('playing');
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);
      vi.mocked(mockSessionRepo.findActiveByUserId).mockResolvedValue(session as unknown as Record<string, unknown>);

      const result = await useCase.execute({ sessionId: 'nonexistent', userId: 'user-1' });

      expect(result.session).toEqual(session);
      expect(mockSessionRepo.findActiveByUserId).toHaveBeenCalledWith('user-1');
    });
  });

  describe('Not found', () => {
    it('should return null session when not found', async () => {
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);

      const result = await useCase.execute({ sessionId: 'nonexistent' });

      expect(result.session).toBeNull();
      expect(result.isActive).toBe(false);
      expect(result.message).toContain('not found');
    });
  });

  describe('Service failures', () => {
    it('should throw StreamingError on repository failure', async () => {
      vi.mocked(mockSessionRepo.findById).mockRejectedValue(new Error('DB error'));

      await expect(useCase.execute({ sessionId: 'session-1' })).rejects.toThrow(StreamingError);
    });
  });
});
