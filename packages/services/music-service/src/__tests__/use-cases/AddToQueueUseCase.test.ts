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
  AddToQueueUseCase,
  type IPlaybackSessionRepository,
  type ITrackRepository,
} from '../../application/use-cases/streaming/AddToQueueUseCase';
import { StreamingError } from '../../application/errors';

describe('AddToQueueUseCase', () => {
  let useCase: AddToQueueUseCase;
  let mockSessionRepo: IPlaybackSessionRepository;
  let mockTrackRepo: ITrackRepository;

  const createMockSession = (overrides = {}) => ({
    id: 'session-1',
    userId: 'user-1',
    currentTrackId: 'track-current',
    queue: {
      items: [
        { trackId: 'track-current', position: 0, metadata: { title: 'Current', displayName: 'Artist', duration: 200 } },
      ],
      currentIndex: 0,
      originalOrder: [],
    },
    ...overrides,
  });

  const createMockTrack = (id: string) => ({
    id,
    title: `Track ${id}`,
    userId: 'user-1',
    duration: 180,
    metadata: { displayName: 'Test Artist' },
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionRepo = {
      findById: vi.fn(),
      update: vi.fn(),
    };
    mockTrackRepo = {
      findTrackById: vi.fn(),
    };
    useCase = new AddToQueueUseCase(mockSessionRepo, mockTrackRepo);
  });

  describe('Happy path', () => {
    it('should add tracks to the end of the queue', async () => {
      const session = createMockSession();
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);
      vi.mocked(mockTrackRepo.findTrackById).mockResolvedValue(createMockTrack('track-2') as unknown as Record<string, unknown>);
      vi.mocked(mockSessionRepo.update).mockResolvedValue(session as unknown as Record<string, unknown>);

      const result = await useCase.execute({
        sessionId: 'session-1',
        trackIds: ['track-2'],
      });

      expect(result.addedTracks).toBe(1);
      expect(result.message).toContain('1 tracks');
      expect(mockSessionRepo.update).toHaveBeenCalledWith(expect.objectContaining({
        id: 'session-1',
        userId: 'user-1',
        currentTrackId: 'track-current',
      }));
    });

    it('should add tracks after current track when position is next', async () => {
      const session = createMockSession();
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);
      vi.mocked(mockTrackRepo.findTrackById).mockResolvedValue(createMockTrack('track-2') as unknown as Record<string, unknown>);
      vi.mocked(mockSessionRepo.update).mockResolvedValue(session as unknown as Record<string, unknown>);

      const result = await useCase.execute({
        sessionId: 'session-1',
        trackIds: ['track-2'],
        position: 'next',
      });

      expect(result.addedTracks).toBe(1);
    });

    it('should add multiple tracks at once', async () => {
      const session = createMockSession();
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);
      vi.mocked(mockTrackRepo.findTrackById)
        .mockResolvedValueOnce(createMockTrack('track-2') as unknown as Record<string, unknown>)
        .mockResolvedValueOnce(createMockTrack('track-3') as unknown as Record<string, unknown>);
      vi.mocked(mockSessionRepo.update).mockResolvedValue(session as unknown as Record<string, unknown>);

      const result = await useCase.execute({
        sessionId: 'session-1',
        trackIds: ['track-2', 'track-3'],
      });

      expect(result.addedTracks).toBe(2);
    });
  });

  describe('Not found', () => {
    it('should throw when session not found', async () => {
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(null);

      await expect(useCase.execute({
        sessionId: 'nonexistent',
        trackIds: ['track-1'],
      })).rejects.toThrow(StreamingError);
    });

    it('should throw when some tracks not found', async () => {
      const session = createMockSession();
      vi.mocked(mockSessionRepo.findById).mockResolvedValue(session as unknown as Record<string, unknown>);
      vi.mocked(mockTrackRepo.findTrackById)
        .mockResolvedValueOnce(createMockTrack('track-2') as unknown as Record<string, unknown>)
        .mockResolvedValueOnce(null);

      await expect(useCase.execute({
        sessionId: 'session-1',
        trackIds: ['track-2', 'nonexistent'],
      })).rejects.toThrow(StreamingError);
    });
  });

  describe('Service failures', () => {
    it('should throw StreamingError when repository fails', async () => {
      vi.mocked(mockSessionRepo.findById).mockRejectedValue(new Error('DB error'));

      await expect(useCase.execute({
        sessionId: 'session-1',
        trackIds: ['track-1'],
      })).rejects.toThrow(StreamingError);
    });
  });
});
