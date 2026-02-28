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

import {
  RemoveFromQueueUseCase,
  type IPlaybackSessionRepository,
} from '../../application/use-cases/streaming/RemoveFromQueueUseCase';
import { StreamingError } from '../../application/errors';

describe('RemoveFromQueueUseCase', () => {
  let useCase: RemoveFromQueueUseCase;
  let mockSessionRepo: IPlaybackSessionRepository;

  const createMockSession = (overrides = {}) => ({
    id: 'session-1',
    userId: 'user-1',
    currentTrackId: 'track-1',
    queue: [
      { id: 'qi-1', trackId: 'track-1' },
      { id: 'qi-2', trackId: 'track-2' },
      { id: 'qi-3', trackId: 'track-3' },
    ],
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionRepo = {
      findById: vi.fn(),
      update: vi.fn(),
    };
    useCase = new RemoveFromQueueUseCase(mockSessionRepo);
  });

  describe('Happy path', () => {
    it('should clear entire queue when clear is true', async () => {
      const session = createMockSession();
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);
      vi.mocked(mockSessionRepo.update).mockResolvedValue({ ...session, queue: [] } as unknown as Record<
        string,
        unknown
      >);

      const result = await useCase.execute({
        sessionId: 'session-1',
        clear: true,
      });

      expect(result.removedItems).toBe(3);
      expect(mockSessionRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'session-1',
          userId: 'user-1',
          queue: [],
        })
      );
    });

    it('should remove item at specific position', async () => {
      const session = createMockSession();
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);
      vi.mocked(mockSessionRepo.update).mockImplementation(async (s: Record<string, unknown>) => s);

      const result = await useCase.execute({
        sessionId: 'session-1',
        position: 1,
      });

      expect(result.removedItems).toBe(1);
    });

    it('should remove items by queue item IDs', async () => {
      const session = createMockSession();
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);
      vi.mocked(mockSessionRepo.update).mockImplementation(async (s: Record<string, unknown>) => s);

      const result = await useCase.execute({
        sessionId: 'session-1',
        queueItemIds: ['qi-2'],
      });

      expect(result.removedItems).toBe(1);
    });

    it('should remove items by track IDs', async () => {
      const session = createMockSession();
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);
      vi.mocked(mockSessionRepo.update).mockImplementation(async (s: Record<string, unknown>) => s);

      const result = await useCase.execute({
        sessionId: 'session-1',
        trackIds: ['track-2', 'track-3'],
      });

      expect(result.removedItems).toBe(2);
    });
  });

  describe('Not found', () => {
    it('should throw when session not found', async () => {
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);

      await expect(
        useCase.execute({
          sessionId: 'nonexistent',
          clear: true,
        })
      ).rejects.toThrow(StreamingError);
    });
  });

  describe('Edge cases', () => {
    it('should handle removing from invalid position gracefully', async () => {
      const session = createMockSession();
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);
      vi.mocked(mockSessionRepo.update).mockImplementation(async (s: Record<string, unknown>) => s);

      const result = await useCase.execute({
        sessionId: 'session-1',
        position: 99,
      });

      expect(result.removedItems).toBe(0);
      expect(result.message).toContain('No items');
    });
  });

  describe('Service failures', () => {
    it('should throw StreamingError on repository failure', async () => {
      vi.mocked(mockSessionRepo.findById).mockRejectedValue(new Error('DB error'));

      await expect(
        useCase.execute({
          sessionId: 'session-1',
          clear: true,
        })
      ).rejects.toThrow(StreamingError);
    });
  });
});
