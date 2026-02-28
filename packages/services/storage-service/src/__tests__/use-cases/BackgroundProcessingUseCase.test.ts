import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
      this.name = 'DomainError';
      if (cause) this.cause = cause;
    }
  },
  createHttpClient: vi.fn(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  })),
  ServiceRegistry: {},
  hasService: () => false,
  getServiceUrl: () => 'http://localhost:3002',
  waitForService: vi.fn(),
  listServices: () => [],
  createServiceUrlsConfig: vi.fn(() => ({})),
  errorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  errorStack: vi.fn((err: unknown) => (err instanceof Error ? err.stack : '')),
  withResilience: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
  createIntervalScheduler: vi.fn(() => ({ start: vi.fn(), stop: vi.fn() })),
}));

import {
  BackgroundProcessingUseCase,
  type INotificationService,
} from '../../application/use-cases/BackgroundProcessingUseCase';
import type { IStorageProvider } from '../../application/interfaces/IStorageProvider';

describe('BackgroundProcessingUseCase', () => {
  let useCase: BackgroundProcessingUseCase;
  let mockProvider: IStorageProvider;
  let mockFileRepository: Record<string, ReturnType<typeof vi.fn>>;
  let mockProcessingJobRepository: Record<string, ReturnType<typeof vi.fn>>;
  let mockNotificationService: INotificationService;
  let jobStore: Record<string, unknown>[];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    jobStore = [];

    mockProvider = {
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      generateSignedUrl: vi.fn(),
      getMetadata: vi.fn(),
      listFiles: vi.fn(),
      getPublicUrl: vi.fn(),
      getProviderInfo: vi.fn().mockReturnValue({ name: 'local' }),
      initialize: vi.fn(),
      cleanup: vi.fn(),
    } as unknown as IStorageProvider;

    mockFileRepository = {
      save: vi.fn(),
      findById: vi.fn(),
      findByPath: vi.fn(),
      findByUserId: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      updateMetadata: vi.fn(),
      findExpired: vi.fn(),
      markFileAsOrphaned: vi.fn(),
      search: vi.fn(),
    };

    let jobCounter = 0;

    mockProcessingJobRepository = {
      createJob: vi.fn().mockImplementation((fileId: string, jobType: string, config?: Record<string, unknown>) => {
        jobCounter++;
        const job = {
          id: `job-${Date.now()}-${jobCounter}`,
          fileId,
          jobType,
          status: 'pending',
          inputParams: config || {},
          outputParams: null,
          errorMessage: null,
          createdAt: new Date(),
          startedAt: null,
          completedAt: null,
        };
        jobStore.push(job);
        return Promise.resolve(job);
      }),
      updateJobStatus: vi.fn().mockImplementation((jobId: string, status: string, result?: Record<string, unknown>) => {
        const job = jobStore.find(j => j.id === jobId);
        if (job) {
          job.status = status;
          if (result?.outputParams) job.outputParams = result.outputParams;
          if (result?.errorMessage) job.errorMessage = result.errorMessage;
          if (status === 'processing') job.startedAt = new Date();
          if (['completed', 'failed', 'cancelled'].includes(status)) job.completedAt = new Date();
        }
        return Promise.resolve(job);
      }),
      getJobById: vi.fn().mockImplementation((jobId: string) => {
        const job = jobStore.find(j => j.id === jobId);
        return Promise.resolve(job || null);
      }),
      getJobsByUser: vi.fn().mockImplementation((userId: string) => {
        return Promise.resolve(jobStore.filter(j => j.inputParams?.userId === userId));
      }),
      getAllJobs: vi.fn().mockImplementation(() => {
        return Promise.resolve([...jobStore]);
      }),
    };

    mockNotificationService = {
      notify: vi.fn().mockResolvedValue(undefined),
    };

    useCase = new BackgroundProcessingUseCase(
      mockFileRepository,
      mockProcessingJobRepository,
      mockProvider,
      mockNotificationService
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('queueTask', () => {
    it('should queue a task successfully', async () => {
      const result = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'thumbnail',
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
      expect(result.message).toContain('thumbnail');
    });

    it('should set default priority to normal', async () => {
      const result = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'compress',
      });

      const status = await useCase.getTaskStatus(result.taskId!);
      expect(status.task!.priority).toBe('normal');
    });

    it('should accept custom priority', async () => {
      const result = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'compress',
        priority: 'urgent',
      });

      const status = await useCase.getTaskStatus(result.taskId!);
      expect(status.task!.priority).toBe('urgent');
    });

    it('should validate convert task requires targetFormat', async () => {
      const result = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'convert',
        parameters: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('targetFormat');
    });

    it('should validate compress quality parameter range', async () => {
      const result = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'compress',
        parameters: { quality: 150 },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('quality');
    });

    it('should set estimated duration based on task type', async () => {
      const result = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'transcode',
      });

      expect(result.success).toBe(true);
      expect(result.taskId).toBeDefined();
    });
  });

  describe('getTaskStatus', () => {
    it('should return task status', async () => {
      const queued = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'thumbnail',
      });

      const result = await useCase.getTaskStatus(queued.taskId!);

      expect(result.success).toBe(true);
      expect(result.task).toBeDefined();
      expect(result.task!.status).toBe('pending');
    });

    it('should fail for non-existent task', async () => {
      const result = await useCase.getTaskStatus('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getUserTasks', () => {
    it('should return all tasks for a user', async () => {
      await useCase.queueTask({ fileId: 'file-1', userId: 'user-1', taskType: 'thumbnail' });
      await useCase.queueTask({ fileId: 'file-2', userId: 'user-1', taskType: 'compress' });
      await useCase.queueTask({ fileId: 'file-3', userId: 'user-2', taskType: 'scan' });

      const result = await useCase.getUserTasks('user-1');

      expect(result.success).toBe(true);
      expect(result.tasks!.length).toBe(2);
    });

    it('should filter by status', async () => {
      await useCase.queueTask({ fileId: 'file-1', userId: 'user-1', taskType: 'thumbnail' });

      const result = await useCase.getUserTasks('user-1', 'pending');

      expect(result.success).toBe(true);
      expect(result.tasks!.every(t => t.status === 'pending')).toBe(true);
    });

    it('should filter by task type', async () => {
      await useCase.queueTask({ fileId: 'file-1', userId: 'user-1', taskType: 'thumbnail' });
      await useCase.queueTask({ fileId: 'file-2', userId: 'user-1', taskType: 'compress' });

      const result = await useCase.getUserTasks('user-1', undefined, 'thumbnail');

      expect(result.success).toBe(true);
      expect(result.tasks!.every(t => t.taskType === 'thumbnail')).toBe(true);
    });
  });

  describe('cancelTask', () => {
    it('should cancel a pending task', async () => {
      const queued = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'thumbnail',
      });

      const result = await useCase.cancelTask(queued.taskId!, 'user-1');

      expect(result.success).toBe(true);
      expect(result.task!.status).toBe('cancelled');
    });

    it('should reject cancellation by non-owner', async () => {
      const queued = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'thumbnail',
      });

      const result = await useCase.cancelTask(queued.taskId!, 'user-2');

      expect(result.success).toBe(false);
      expect(result.error).toContain('permissions');
    });

    it('should reject cancellation of completed task', async () => {
      const queued = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'thumbnail',
      });

      const job = jobStore.find(j => j.id === queued.taskId);
      if (job) job.status = 'completed';

      const result = await useCase.cancelTask(queued.taskId!, 'user-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot cancel');
    });

    it('should fail for non-existent task', async () => {
      const result = await useCase.cancelTask('non-existent', 'user-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('retryTask', () => {
    it('should retry a failed task', async () => {
      const queued = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'thumbnail',
      });

      const job = jobStore.find(j => j.id === queued.taskId);
      if (job) job.status = 'failed';

      const result = await useCase.retryTask(queued.taskId!, 'user-1');

      expect(result.success).toBe(true);
      expect(result.task!.status).toBe('pending');
      expect(result.task!.progress).toBe(0);
    });

    it('should reject retry of pending task', async () => {
      const queued = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'thumbnail',
      });

      const result = await useCase.retryTask(queued.taskId!, 'user-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot retry');
    });

    it('should reject retry by non-owner', async () => {
      const queued = await useCase.queueTask({
        fileId: 'file-1',
        userId: 'user-1',
        taskType: 'thumbnail',
      });

      const job = jobStore.find(j => j.id === queued.taskId);
      if (job) job.status = 'failed';

      const result = await useCase.retryTask(queued.taskId!, 'user-2');

      expect(result.success).toBe(false);
      expect(result.error).toContain('permissions');
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      await useCase.queueTask({ fileId: 'file-1', userId: 'user-1', taskType: 'thumbnail' });
      await useCase.queueTask({ fileId: 'file-2', userId: 'user-1', taskType: 'compress' });

      const result = await useCase.getQueueStats();

      expect(result.success).toBe(true);
      expect(result.stats!.totalTasks).toBe(2);
      expect(result.stats!.pendingTasks).toBe(2);
      expect(result.stats!.queueLength).toBe(2);
    });

    it('should return zero average processing time with no completed tasks', async () => {
      const result = await useCase.getQueueStats();

      expect(result.stats!.averageProcessingTime).toBe(0);
    });
  });
});
