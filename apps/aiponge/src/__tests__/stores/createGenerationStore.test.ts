import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../lib/axiosApiClient', () => ({
  apiRequest: vi.fn(),
}));

vi.mock('../../auth/store', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ token: 'test-token', status: 'authenticated' })),
  },
}));

import { createGenerationStore, type BaseGenerationProgress, type GenerationStoreConfig } from '../../stores/createGenerationStore';
import { apiRequest } from '../../lib/axiosApiClient';
import { useAuthStore } from '../../auth/store';

interface TestProgress extends BaseGenerationProgress {
  customField?: string;
}

function createTestConfig(overrides?: Partial<GenerationStoreConfig<TestProgress>>): GenerationStoreConfig<TestProgress> {
  return {
    name: 'test-gen',
    pollInterval: 1000,
    apiEndpoint: '/api/v1/test/progress',
    activeEndpoint: '/api/v1/test/active',
    cacheEventType: 'test:completed',
    isActive: (p: TestProgress) => p.status === 'queued' || p.status === 'processing',
    createInitialProgress: (requestId: string, options?: Record<string, unknown>) => ({
      id: requestId,
      userId: 'user-123',
      status: 'queued' as const,
      phase: 'initializing',
      percentComplete: 0,
      customField: options?.customField as string | undefined,
    }),
    mergeProgress: (_existing: TestProgress | undefined, update: TestProgress) => update,
    onCompleted: vi.fn(),
    onClearGeneration: vi.fn(),
    ...overrides,
  };
}

describe('createGenerationStore', () => {
  const mockApiRequest = vi.mocked(apiRequest);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(useAuthStore.getState).mockReturnValue({ token: 'test-token', status: 'authenticated' } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Initial state', () => {
    it('has correct initial state', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);
      const state = store.getState();

      expect(state.activeGenerations).toEqual({});
      expect(state.isPolling).toBe(false);
      expect(state.lastError).toBeNull();
      expect(state.isPendingGeneration).toBe(false);
      expect(state.pollInterval).toBe(1000);
    });
  });

  describe('startGeneration', () => {
    it('adds generation to activeGenerations with initial progress from createInitialProgress', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);
      mockApiRequest.mockResolvedValueOnce({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'queued', phase: 'initializing', percentComplete: 0 } });

      store.getState().startGeneration('req-1');

      const state = store.getState();
      expect(state.activeGenerations['req-1']).toEqual({
        id: 'req-1',
        userId: 'user-123',
        status: 'queued',
        phase: 'initializing',
        percentComplete: 0,
        customField: undefined,
      });
    });

    it('sets isPolling=true and isPendingGeneration=false', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);
      mockApiRequest.mockResolvedValueOnce({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'queued', phase: 'initializing', percentComplete: 0 } });

      store.getState().setPendingGeneration(true);
      expect(store.getState().isPendingGeneration).toBe(true);

      store.getState().startGeneration('req-1');

      expect(store.getState().isPolling).toBe(true);
      expect(store.getState().isPendingGeneration).toBe(false);
    });

    it('passes options to createInitialProgress', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);
      mockApiRequest.mockResolvedValueOnce({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'queued', phase: 'initializing', percentComplete: 0 } });

      store.getState().startGeneration('req-1', { customField: 'my-value' });

      expect(store.getState().activeGenerations['req-1'].customField).toBe('my-value');
    });

    it('triggers immediate pollProgress call', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);
      mockApiRequest.mockResolvedValueOnce({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'queued', phase: 'initializing', percentComplete: 0 } });

      store.getState().startGeneration('req-1');

      expect(mockApiRequest).toHaveBeenCalledWith('/api/v1/test/progress/req-1');
    });
  });

  describe('setPendingGeneration', () => {
    it('sets isPendingGeneration to true', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      store.getState().setPendingGeneration(true);
      expect(store.getState().isPendingGeneration).toBe(true);
    });

    it('sets isPendingGeneration to false', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      store.getState().setPendingGeneration(true);
      store.getState().setPendingGeneration(false);
      expect(store.getState().isPendingGeneration).toBe(false);
    });
  });

  describe('stopPolling', () => {
    it('sets isPolling=false', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);
      mockApiRequest.mockResolvedValue({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'queued', phase: 'initializing', percentComplete: 0 } });

      store.getState().startGeneration('req-1');
      expect(store.getState().isPolling).toBe(true);

      store.getState().stopPolling();
      expect(store.getState().isPolling).toBe(false);
    });

    it('clears interval timer so no further polls happen', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);
      mockApiRequest.mockResolvedValue({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'queued', phase: 'init', percentComplete: 0 } });

      store.getState().startGeneration('req-1');
      mockApiRequest.mockClear();

      store.getState().stopPolling();

      vi.advanceTimersByTime(5000);
      expect(mockApiRequest).not.toHaveBeenCalled();
    });
  });

  describe('pollProgress', () => {
    it('makes API request to apiEndpoint/requestId for each active generation', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'completed', phase: 'done', percentComplete: 100 } });
      store.getState().startGeneration('req-1');
      await vi.advanceTimersByTimeAsync(0);

      expect(mockApiRequest).toHaveBeenCalledWith('/api/v1/test/progress/req-1');
    });

    it('calls mergeProgress with response data', async () => {
      const mergeProgress = vi.fn((_existing: TestProgress | undefined, update: TestProgress) => update);
      const config = createTestConfig({ mergeProgress });
      const { store } = createGenerationStore(config);

      const responseData = { id: 'req-1', userId: 'user-123', status: 'completed' as const, phase: 'done', percentComplete: 100 };
      mockApiRequest.mockResolvedValueOnce({ success: true, data: responseData });

      store.getState().startGeneration('req-1');
      await vi.advanceTimersByTimeAsync(0);

      expect(mergeProgress).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'req-1' }),
        responseData
      );
    });

    it('calls onCompleted when status is completed', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({
        success: true,
        data: { id: 'req-1', userId: 'user-123', status: 'completed', phase: 'done', percentComplete: 100 },
      });

      store.getState().startGeneration('req-1');
      await vi.runAllTimersAsync();

      expect(config.onCompleted).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({ status: 'completed' }),
        expect.any(Function),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('calls onCompleted when status is partial', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({
        success: true,
        data: { id: 'req-1', userId: 'user-123', status: 'partial', phase: 'partial-done', percentComplete: 80 },
      });

      store.getState().startGeneration('req-1');
      await vi.runAllTimersAsync();

      expect(config.onCompleted).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({ status: 'partial' }),
        expect.any(Function),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('calls onCompleted when status is failed', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({
        success: true,
        data: { id: 'req-1', userId: 'user-123', status: 'failed', phase: 'error', percentComplete: 0 },
      });

      store.getState().startGeneration('req-1');
      await vi.runAllTimersAsync();

      expect(config.onCompleted).toHaveBeenCalledWith(
        'req-1',
        expect.objectContaining({ status: 'failed' }),
        expect.any(Function),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('stops polling when no active generations remain', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({
        success: true,
        data: { id: 'req-1', userId: 'user-123', status: 'completed', phase: 'done', percentComplete: 100 },
      });

      store.getState().startGeneration('req-1');
      await vi.runAllTimersAsync();

      expect(store.getState().isPolling).toBe(false);
    });

    it('handles 404 response by removing generation from tracking', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockRejectedValueOnce({ response: { status: 404 } });

      store.getState().startGeneration('req-1');
      await vi.runAllTimersAsync();

      expect(store.getState().activeGenerations['req-1']).toBeUndefined();
    });

    it('handles other errors by setting lastError', async () => {
      const config = createTestConfig({
        mergeProgress: () => { throw new Error('Merge failed'); },
      });
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({
        success: true,
        data: { id: 'req-1', userId: 'user-123', status: 'processing', phase: 'working', percentComplete: 50 },
      });

      store.getState().startGeneration('req-1');
      await vi.advanceTimersByTimeAsync(0);

      expect(store.getState().lastError).toBe('Merge failed');
    });

    it('skips polling when no active IDs', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      await store.getState().pollProgress();

      expect(mockApiRequest).not.toHaveBeenCalled();
    });

    it('skips polling when isPolling=false', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'queued', phase: 'init', percentComplete: 0 } });
      store.getState().startGeneration('req-1');

      store.getState().stopPolling();
      mockApiRequest.mockClear();

      await store.getState().pollProgress();
      expect(mockApiRequest).not.toHaveBeenCalled();
    });
  });

  describe('clearGeneration', () => {
    it('removes specific generation from activeGenerations when id is provided', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);
      mockApiRequest.mockResolvedValue({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'queued', phase: 'init', percentComplete: 0 } });

      store.getState().startGeneration('req-1');
      store.getState().clearGeneration('req-1');

      expect(store.getState().activeGenerations['req-1']).toBeUndefined();
    });

    it('clears all generations, stops polling, clears lastError when no id', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);
      mockApiRequest.mockResolvedValue({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'queued', phase: 'init', percentComplete: 0 } });

      store.getState().startGeneration('req-1');
      store.getState().clearGeneration();

      const state = store.getState();
      expect(state.activeGenerations).toEqual({});
      expect(state.isPolling).toBe(false);
      expect(state.lastError).toBeNull();
    });

    it('calls config.onClearGeneration with id', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);
      mockApiRequest.mockResolvedValue({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'queued', phase: 'init', percentComplete: 0 } });

      store.getState().startGeneration('req-1');
      store.getState().clearGeneration('req-1');

      expect(config.onClearGeneration).toHaveBeenCalledWith('req-1', expect.any(Map));
    });

    it('calls config.onClearGeneration with undefined when clearing all', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      store.getState().clearGeneration();

      expect(config.onClearGeneration).toHaveBeenCalledWith(undefined, expect.any(Map));
    });
  });

  describe('getActiveGenerationsList', () => {
    it('returns only active generations filtered by config.isActive', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);
      mockApiRequest.mockResolvedValue({ success: true, data: { id: 'req-1', userId: 'user-123', status: 'queued', phase: 'init', percentComplete: 0 } });

      store.getState().startGeneration('req-1');

      const activeList = store.getState().getActiveGenerationsList();
      expect(activeList).toHaveLength(1);
      expect(activeList[0].id).toBe('req-1');
    });

    it('returns empty array when no active generations', () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      const activeList = store.getState().getActiveGenerationsList();
      expect(activeList).toEqual([]);
    });

    it('excludes completed generations from active list', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({
        success: true,
        data: { id: 'req-1', userId: 'user-123', status: 'completed', phase: 'done', percentComplete: 100 },
      });

      store.getState().startGeneration('req-1');
      await vi.runAllTimersAsync();

      const activeList = store.getState().getActiveGenerationsList();
      expect(activeList).toEqual([]);
    });
  });

  describe('checkActiveGenerations', () => {
    it('skips check when not authenticated', async () => {
      vi.mocked(useAuthStore.getState).mockReturnValue({ token: null, status: 'unauthenticated' } as any);

      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      await store.getState().checkActiveGenerations();

      expect(mockApiRequest).not.toHaveBeenCalled();
    });

    it('makes API request to activeEndpoint', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({ success: true, data: [] });

      await store.getState().checkActiveGenerations();

      expect(mockApiRequest).toHaveBeenCalledWith('/api/v1/test/active');
    });

    it('adds found generations to activeGenerations', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({
        success: true,
        data: [
          { id: 'req-1', userId: 'user-123', status: 'processing', phase: 'working', percentComplete: 50 },
        ],
      });

      await store.getState().checkActiveGenerations();

      expect(store.getState().activeGenerations['req-1']).toEqual(
        expect.objectContaining({ id: 'req-1', status: 'processing' })
      );
    });

    it('starts polling if there are processing generations', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({
        success: true,
        data: [
          { id: 'req-1', userId: 'user-123', status: 'processing', phase: 'working', percentComplete: 50 },
        ],
      });

      await store.getState().checkActiveGenerations();

      expect(store.getState().isPolling).toBe(true);
    });

    it('deduplicates concurrent checks by coalescing promises', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      let resolveApi: (value: unknown) => void;
      const apiPromise = new Promise(resolve => { resolveApi = resolve; });
      mockApiRequest.mockReturnValue(apiPromise as any);

      const check1 = store.getState().checkActiveGenerations();
      const check2 = store.getState().checkActiveGenerations();

      resolveApi!({ success: true, data: [] });

      await check1;
      await check2;

      expect(mockApiRequest).toHaveBeenCalledTimes(1);
    });

    it('does not start polling when no processing generations found', async () => {
      const config = createTestConfig();
      const { store } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({
        success: true,
        data: [
          { id: 'req-1', userId: 'user-123', status: 'completed', phase: 'done', percentComplete: 100 },
        ],
      });

      await store.getState().checkActiveGenerations();

      expect(store.getState().isPolling).toBe(false);
    });
  });

  describe('completedRequestIds', () => {
    it('returns a Map from createGenerationStore', () => {
      const config = createTestConfig();
      const { completedRequestIds } = createGenerationStore(config);

      expect(completedRequestIds).toBeInstanceOf(Map);
    });

    it('is passed to onCompleted callback', async () => {
      const config = createTestConfig();
      const { store, completedRequestIds } = createGenerationStore(config);

      mockApiRequest.mockResolvedValueOnce({
        success: true,
        data: { id: 'req-1', userId: 'user-123', status: 'completed', phase: 'done', percentComplete: 100 },
      });

      store.getState().startGeneration('req-1');
      await vi.runAllTimersAsync();

      expect(config.onCompleted).toHaveBeenCalledWith(
        'req-1',
        expect.any(Object),
        expect.any(Function),
        expect.any(Function),
        completedRequestIds
      );
    });
  });
});
