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

vi.mock('@aiponge/shared-contracts', () => ({
  ALBUM_LIFECYCLE: {
    DRAFT: 'draft',
    PUBLISHED: 'published',
    ARCHIVED: 'archived',
  },
}));

vi.mock('uuid', () => ({
  v4: () => 'test-uuid-1234',
}));

import { CreateAlbumUseCase, type CreateAlbumRequest } from '../../application/use-cases/streaming/CreateAlbumUseCase';
import { MusicError } from '../../application/errors';

describe('CreateAlbumUseCase', () => {
  let useCase: CreateAlbumUseCase;
  let mockAlbumRepo: Record<string, ReturnType<typeof vi.fn>>;

  const validRequest: CreateAlbumRequest = {
    title: 'My Album',
    userId: 'user-1',
    displayName: 'Test Artist',
    genre: ['pop', 'electronic'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAlbumRepo = {
      create: vi.fn(),
    };
    useCase = new CreateAlbumUseCase(mockAlbumRepo);
  });

  describe('Happy path', () => {
    it('should create album with valid request', async () => {
      mockAlbumRepo.create.mockResolvedValue({
        id: 'test-uuid-1234',
        status: 'draft',
        ...validRequest,
      });

      const result = await useCase.execute(validRequest);

      expect(result.albumId).toBe('test-uuid-1234');
      expect(result.status).toBe('draft');
      expect(result.message).toContain('successfully');
      expect(mockAlbumRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-uuid-1234',
        title: 'My Album',
        userId: 'user-1',
        displayName: 'Test Artist',
        genre: ['pop', 'electronic'],
        status: 'draft',
      }));
    });

    it('should create album with all optional fields', async () => {
      const fullRequest: CreateAlbumRequest = {
        ...validRequest,
        releaseDate: new Date('2024-01-01'),
        totalDuration: 3600,
        trackCount: 12,
        artworkUrl: 'https://cdn.example.com/art.jpg',
        recordLabel: 'Indie Records',
        catalogNumber: 'CAT-001',
        isCompilation: true,
      };
      mockAlbumRepo.create.mockResolvedValue({
        id: 'test-uuid-1234',
        status: 'draft',
        ...fullRequest,
      });

      const result = await useCase.execute(fullRequest);

      expect(result.albumId).toBe('test-uuid-1234');
    });
  });

  describe('Validation errors', () => {
    it('should throw when title is empty', async () => {
      await expect(useCase.execute({ ...validRequest, title: '' })).rejects.toThrow(MusicError);
    });

    it('should throw when title is whitespace only', async () => {
      await expect(useCase.execute({ ...validRequest, title: '   ' })).rejects.toThrow(MusicError);
    });

    it('should throw when userId is empty', async () => {
      await expect(useCase.execute({ ...validRequest, userId: '' })).rejects.toThrow(MusicError);
    });

    it('should throw when displayName is empty', async () => {
      await expect(useCase.execute({ ...validRequest, displayName: '' })).rejects.toThrow(MusicError);
    });

    it('should throw when genre array is empty', async () => {
      await expect(useCase.execute({ ...validRequest, genre: [] })).rejects.toThrow(MusicError);
    });

    it('should throw when release date is in the future', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      await expect(useCase.execute({ ...validRequest, releaseDate: futureDate })).rejects.toThrow(MusicError);
    });

    it('should throw when track count is zero or negative', async () => {
      await expect(useCase.execute({ ...validRequest, trackCount: 0 })).rejects.toThrow(MusicError);
      await expect(useCase.execute({ ...validRequest, trackCount: -1 })).rejects.toThrow(MusicError);
    });
  });

  describe('Service failures', () => {
    it('should throw MusicError when repository fails', async () => {
      mockAlbumRepo.create.mockRejectedValue(new Error('DB connection lost'));

      await expect(useCase.execute(validRequest)).rejects.toThrow(MusicError);
    });

    it('should propagate MusicError from repository', async () => {
      mockAlbumRepo.create.mockRejectedValue(MusicError.albumAlreadyExists('test'));

      await expect(useCase.execute(validRequest)).rejects.toThrow(MusicError);
    });
  });
});
