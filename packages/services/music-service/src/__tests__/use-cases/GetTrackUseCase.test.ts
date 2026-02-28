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
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
  ServiceRegistry: {},
  hasService: vi.fn().mockReturnValue(false),
  waitForService: vi.fn(),
  listServices: vi.fn(),
}));

import {
  GetTrackUseCase,
  type ITrackRepository,
  type TrackDetails,
} from '../../application/use-cases/streaming/GetTrackUseCase';

describe('GetTrackUseCase', () => {
  let useCase: GetTrackUseCase;
  let mockTrackRepository: ITrackRepository;

  const sampleTrack: TrackDetails = {
    id: 'track-1',
    title: 'Test Song',
    userId: 'user-1',
    albumId: 'album-1',
    duration: 180,
    fileUrl: 'https://cdn.example.com/track.mp3',
    artworkUrl: 'https://cdn.example.com/artwork.jpg',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTrackRepository = {
      findById: vi.fn(),
    };
    useCase = new GetTrackUseCase(mockTrackRepository);
  });

  describe('Happy path', () => {
    it('should return track details when track exists', async () => {
      vi.mocked(mockTrackRepository.findById).mockResolvedValue(sampleTrack);

      const result = await useCase.execute({ trackId: 'track-1' });

      expect(result.success).toBe(true);
      expect(result.track).toEqual(sampleTrack);
      expect(mockTrackRepository.findById).toHaveBeenCalledWith('track-1');
    });
  });

  describe('Not found', () => {
    it('should return failure when track does not exist', async () => {
      vi.mocked(mockTrackRepository.findById).mockResolvedValue(null);

      const result = await useCase.execute({ trackId: 'nonexistent' });

      expect(result.success).toBe(false);
      expect(result.track).toBeNull();
      expect(result.message).toBe('Track not found');
    });
  });

  describe('Service failures', () => {
    it('should return failure when repository throws', async () => {
      vi.mocked(mockTrackRepository.findById).mockRejectedValue(new Error('DB connection failed'));

      const result = await useCase.execute({ trackId: 'track-1' });

      expect(result.success).toBe(false);
      expect(result.track).toBeNull();
      expect(result.message).toBe('DB connection failed');
    });

    it('should handle non-Error exceptions gracefully', async () => {
      vi.mocked(mockTrackRepository.findById).mockRejectedValue('unexpected error');

      const result = await useCase.execute({ trackId: 'track-1' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Failed to get track');
    });
  });
});
