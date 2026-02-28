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
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
  ServiceRegistry: {},
  hasService: vi.fn().mockReturnValue(false),
  waitForService: vi.fn(),
  listServices: vi.fn(),
}));

vi.mock('@config/service-urls', () => ({
  getLogger: () => mockLogger,
}));

import {
  ProcessAudioUseCase,
  type ProcessAudioRequest,
} from '../../application/use-cases/music/ProcessAudioUseCase';

describe('ProcessAudioUseCase', () => {
  let useCase: ProcessAudioUseCase;
  let mockAudioService: Record<string, ReturnType<typeof vi.fn>>;
  let mockJobRepo: Record<string, ReturnType<typeof vi.fn>>;
  let mockAnalyticsClient: Record<string, ReturnType<typeof vi.fn>>;

  const validRequest: ProcessAudioRequest = {
    audioUrl: 'https://cdn.example.com/track.mp3',
    processingType: 'normalize',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudioService = {
      normalizeAudio: vi.fn(),
      masterAudio: vi.fn(),
      enhanceAudio: vi.fn(),
      convertFormat: vi.fn(),
      processAudio: vi.fn(),
    };
    mockJobRepo = {
      save: vi.fn(),
      findById: vi.fn(),
      update: vi.fn(),
    };
    mockAnalyticsClient = {
      recordEvent: vi.fn().mockResolvedValue(undefined),
    };
    useCase = new ProcessAudioUseCase(mockAudioService, mockJobRepo, mockAnalyticsClient);
  });

  describe('Happy path', () => {
    it('should create a processing job and return success', async () => {
      mockJobRepo.save.mockImplementation(async (job: Record<string, unknown>) => job);

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(true);
      expect(result.jobId).toBeTruthy();
      expect(result.estimatedDuration).toBeDefined();
      expect(result.status).toBe('pending');
      expect(mockJobRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        inputUrl: 'https://cdn.example.com/track.mp3',
        processingType: 'normalize',
        status: 'pending',
      }));
    });

    it('should accept all processing types', async () => {
      mockJobRepo.save.mockImplementation(async (job: Record<string, unknown>) => job);

      for (const type of ['normalize', 'master', 'effects', 'convert', 'enhance'] as const) {
        const result = await useCase.execute({ ...validRequest, processingType: type });
        expect(result.success).toBe(true);
      }
    });

    it('should record analytics event on start', async () => {
      mockJobRepo.save.mockImplementation(async (job: Record<string, unknown>) => job);

      await useCase.execute(validRequest);

      expect(mockAnalyticsClient.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'audio_processing_started',
        })
      );
    });
  });

  describe('Validation errors', () => {
    it('should fail when audioUrl is missing', async () => {
      const result = await useCase.execute({ ...validRequest, audioUrl: '' });

      expect(result.success).toBe(false);
    });

    it('should fail when processingType is missing', async () => {
      const result = await useCase.execute({ ...validRequest, processingType: '' as unknown as string });

      expect(result.success).toBe(false);
    });

    it('should fail when processingType is invalid', async () => {
      const result = await useCase.execute({ ...validRequest, processingType: 'invalid' as unknown as string });

      expect(result.success).toBe(false);
    });

    it('should fail when bitrate is out of range', async () => {
      const result = await useCase.execute({ ...validRequest, bitrate: 10 });

      expect(result.success).toBe(false);
    });

    it('should fail when sampleRate is invalid', async () => {
      const result = await useCase.execute({ ...validRequest, sampleRate: 12000 });

      expect(result.success).toBe(false);
    });

    it('should fail when channels is invalid', async () => {
      const result = await useCase.execute({ ...validRequest, channels: 5 as unknown as number });

      expect(result.success).toBe(false);
    });
  });

  describe('Get job status', () => {
    it('should return job status when found', async () => {
      const mockJob = {
        id: 'job-1',
        status: 'processing',
        progressPercentage: 50,
        processingType: 'normalize',
        inputUrl: 'https://cdn.example.com/track.mp3',
        parameters: {},
      };
      mockJobRepo.findById.mockResolvedValue(mockJob);

      const result = await useCase.getJobStatus('job-1');

      expect(result.success).toBe(true);
      expect(result.job).toEqual(mockJob);
      expect(result.progress).toBeDefined();
    });

    it('should return failure when job not found', async () => {
      mockJobRepo.findById.mockResolvedValue(null);

      const result = await useCase.getJobStatus('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle repository errors', async () => {
      mockJobRepo.findById.mockRejectedValue(new Error('DB error'));

      const result = await useCase.getJobStatus('job-1');

      expect(result.success).toBe(false);
    });
  });

  describe('Cancel job', () => {
    it('should cancel a pending job', async () => {
      const mockJob = { id: 'job-1', status: 'pending', processingType: 'normalize' };
      mockJobRepo.findById.mockResolvedValue(mockJob);
      mockJobRepo.update.mockResolvedValue(undefined);

      const result = await useCase.cancelJob('job-1');

      expect(result.success).toBe(true);
      expect(mockJobRepo.update).toHaveBeenCalledWith(expect.objectContaining({
        id: 'job-1',
        status: 'failed',
        errorMessage: 'Cancelled by user',
      }));
    });

    it('should not cancel a completed job', async () => {
      const mockJob = { id: 'job-1', status: 'completed', processingType: 'normalize' };
      mockJobRepo.findById.mockResolvedValue(mockJob);

      const result = await useCase.cancelJob('job-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('completed');
    });

    it('should not cancel a failed job', async () => {
      const mockJob = { id: 'job-1', status: 'failed', processingType: 'normalize' };
      mockJobRepo.findById.mockResolvedValue(mockJob);

      const result = await useCase.cancelJob('job-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('failed');
    });

    it('should return failure when job not found for cancellation', async () => {
      mockJobRepo.findById.mockResolvedValue(null);

      const result = await useCase.cancelJob('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('Service failures', () => {
    it('should handle repository save failure', async () => {
      mockJobRepo.save.mockRejectedValue(new Error('DB write failed'));

      const result = await useCase.execute(validRequest);

      expect(result.success).toBe(false);
    });

    it('should record failure analytics when processing fails', async () => {
      mockJobRepo.save.mockRejectedValue(new Error('DB error'));

      await useCase.execute(validRequest);

      expect(mockAnalyticsClient.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'audio_processing_failed',
        })
      );
    });
  });
});
