import { create, type StoreApi } from 'zustand';
import { logger } from '../lib/logger';
import { apiRequest } from '../lib/axiosApiClient';
import { useAuthStore } from '../auth/store';

export interface BaseGenerationProgress {
  id: string;
  userId: string;
  status: 'queued' | 'processing' | 'completed' | 'partial' | 'failed';
  phase: string;
  percentComplete: number;
  errorMessage?: string | null;
}

export interface GenerationState<TProgress extends BaseGenerationProgress> {
  activeGenerations: Record<string, TProgress>;
  isPolling: boolean;
  pollInterval: number;
  lastError: string | null;
  isPendingGeneration: boolean;
}

export interface GenerationActions<TProgress extends BaseGenerationProgress> {
  startGeneration: (requestId: string, options?: Record<string, unknown>) => void;
  setPendingGeneration: (pending: boolean) => void;
  stopPolling: () => void;
  pollProgress: () => Promise<void>;
  checkActiveGenerations: () => Promise<void>;
  clearGeneration: (id?: string) => void;
  getActiveGenerationsList: () => TProgress[];
}

export type GenerationStore<TProgress extends BaseGenerationProgress> = GenerationState<TProgress> &
  GenerationActions<TProgress>;

type SetFn<TProgress extends BaseGenerationProgress> = StoreApi<GenerationStore<TProgress>>['setState'];
type GetFn<TProgress extends BaseGenerationProgress> = StoreApi<GenerationStore<TProgress>>['getState'];

export interface GenerationStoreConfig<TProgress extends BaseGenerationProgress> {
  name: string;
  pollInterval: number;
  apiEndpoint: string;
  activeEndpoint: string;
  cacheEventType: string;
  isActive: (progress: TProgress) => boolean;
  createInitialProgress: (requestId: string, options?: Record<string, unknown>) => TProgress;
  mergeProgress: (existing: TProgress | undefined, update: TProgress) => TProgress;
  onCompleted: (
    requestId: string,
    progress: TProgress,
    get: GetFn<TProgress>,
    set: SetFn<TProgress>,
    completedRequestIds: Map<string, number>
  ) => void;
  onClearGeneration?: (id: string | undefined, completedRequestIds: Map<string, number>) => void;
}

const COMPLETED_ID_TTL_MS = 5 * 60 * 1000;

export function createGenerationStore<TProgress extends BaseGenerationProgress>(
  config: GenerationStoreConfig<TProgress>
) {
  let pollingTimer: ReturnType<typeof setInterval> | null = null;
  const completedRequestIds = new Map<string, number>();
  let activeCheckPromise: Promise<void> | null = null;

  const initialState: GenerationState<TProgress> = {
    activeGenerations: {} as Record<string, TProgress>,
    isPolling: false,
    pollInterval: config.pollInterval,
    lastError: null,
    isPendingGeneration: false,
  };

  const store = create<GenerationStore<TProgress>>((set, get) => ({
    ...initialState,

    startGeneration: (requestId: string, options?: Record<string, unknown>) => {
      logger.info(`[${config.name}] Starting polling`, { requestId });

      const newGeneration = config.createInitialProgress(requestId, options);

      set(state => ({
        activeGenerations: {
          ...state.activeGenerations,
          [requestId]: newGeneration,
        },
        isPolling: true,
        isPendingGeneration: false,
        lastError: null,
      }));

      if (pollingTimer) clearInterval(pollingTimer);
      get().pollProgress();
      pollingTimer = setInterval(() => {
        get().pollProgress();
      }, get().pollInterval);
    },

    setPendingGeneration: (pending: boolean) => {
      logger.debug(`[${config.name}] Setting pending generation`, { pending });
      set({ isPendingGeneration: pending });
    },

    stopPolling: () => {
      logger.debug(`[${config.name}] Stopping polling`);
      if (pollingTimer) {
        clearInterval(pollingTimer);
        pollingTimer = null;
      }
      set({ isPolling: false });
    },

    pollProgress: async () => {
      const { activeGenerations, isPolling } = get();
      const activeIds = Object.keys(activeGenerations).filter(id => {
        const gen = activeGenerations[id];
        return gen && config.isActive(gen);
      });

      if (activeIds.length === 0 || !isPolling) {
        if (activeIds.length === 0 && pollingTimer) {
          get().stopPolling();
        }
        return;
      }

      try {
        const STAGGER_DELAY_MS = 500;
        const updates: Array<{ id: string; success: boolean; data: TProgress | null; notFound?: boolean }> = [];
        for (let i = 0; i < activeIds.length; i++) {
          const id = activeIds[i];
          if (i > 0) {
            await new Promise(resolve => setTimeout(resolve, STAGGER_DELAY_MS));
          }
          try {
            const response = (await apiRequest(`${config.apiEndpoint}/${id}`)) as {
              success: boolean;
              data?: TProgress;
            };
            updates.push({ id, success: true, data: response.data || null });
          } catch (error: unknown) {
            const err = error as { response?: { status?: number }; statusCode?: number };
            const statusCode = err?.response?.status || err?.statusCode;
            if (statusCode === 404) {
              logger.info(`[${config.name}] Request not found, removing from tracking`, { id });
              updates.push({ id, success: false, data: null, notFound: true });
            } else {
              logger.warn(`[${config.name}] Poll failed for request`, { id, error });
              updates.push({ id, success: false, data: null, notFound: false });
            }
          }
        }

        const newGenerations = { ...get().activeGenerations };
        let hasActiveGenerations = false;

        for (const update of updates) {
          if (update.notFound) {
            delete newGenerations[update.id];
            continue;
          }
          if (update.success && update.data) {
            const progress = update.data;
            const current = newGenerations[update.id];

            newGenerations[update.id] = config.mergeProgress(current, progress);

            logger.debug(`[${config.name}] Progress update`, {
              id: progress.id,
              status: progress.status,
              phase: progress.phase,
              percentComplete: progress.percentComplete,
            });

            if (['completed', 'partial', 'failed'].includes(progress.status)) {
              logger.info(`[${config.name}] Generation finished`, {
                id: progress.id,
                status: progress.status,
              });

              config.onCompleted(update.id, progress, get, set, completedRequestIds);
            } else {
              hasActiveGenerations = true;
            }
          } else if (!update.notFound) {
            const existing = newGenerations[update.id];
            if (existing && config.isActive(existing)) {
              logger.warn(`[${config.name}] Poll failed but generation still active, continuing`, {
                id: update.id,
                status: existing.status,
              });
              hasActiveGenerations = true;
            }
          }
        }

        set({ activeGenerations: newGenerations, lastError: null });

        if (!hasActiveGenerations) {
          get().stopPolling();
        }

        if (completedRequestIds.size > 0) {
          const now = Date.now();
          for (const [id, ts] of completedRequestIds) {
            if (now - ts > COMPLETED_ID_TTL_MS) {
              completedRequestIds.delete(id);
            }
          }
        }
      } catch (error) {
        logger.warn(`[${config.name}] Poll batch failed`, { error });
        set({ lastError: error instanceof Error ? error.message : 'Poll failed' });
      }
    },

    checkActiveGenerations: async () => {
      if (activeCheckPromise) {
        await activeCheckPromise;
        return;
      }

      const doCheck = async () => {
        const authState = useAuthStore.getState();
        if (!authState.token || authState.status !== 'authenticated') {
          logger.debug(`[${config.name}] Skipping check - user not authenticated`);
          return;
        }

        try {
          const response = (await apiRequest(config.activeEndpoint)) as {
            success: boolean;
            data?: TProgress[];
          };

          const currentGenerations = get().activeGenerations;

          if (response.success && response.data && response.data.length > 0) {
            const generations: Record<string, TProgress> = { ...currentGenerations };
            let hasProcessing = false;

            for (const gen of response.data) {
              if (!currentGenerations[gen.id]) {
                logger.info(`[${config.name}] Found active generation`, { id: gen.id });
              }
              const existing = generations[gen.id];
              generations[gen.id] = config.mergeProgress(existing, gen);
              if (gen.status === 'processing' || gen.status === 'queued') {
                hasProcessing = true;
              }
            }

            set({ activeGenerations: generations });

            if (hasProcessing && !pollingTimer) {
              if (pollingTimer) clearInterval(pollingTimer);
              set({ isPolling: true });
              pollingTimer = setInterval(() => {
                get().pollProgress();
              }, get().pollInterval);
            }
          } else {
            const hasLocalActive = Object.values(currentGenerations).some(gen => config.isActive(gen));
            if (!hasLocalActive) {
              set({ activeGenerations: {} as Record<string, TProgress> });
            }
          }
        } catch (error) {
          logger.debug(`[${config.name}] No active generations found`);
        }
      };

      activeCheckPromise = doCheck().finally(() => {
        activeCheckPromise = null;
      });
      await activeCheckPromise;
    },

    clearGeneration: (id?: string) => {
      if (id) {
        set(state => {
          const newGenerations = { ...state.activeGenerations };
          delete newGenerations[id];
          return { activeGenerations: newGenerations };
        });
      } else {
        get().stopPolling();
        set({ activeGenerations: {} as Record<string, TProgress>, lastError: null });
      }
      config.onClearGeneration?.(id, completedRequestIds);
    },

    getActiveGenerationsList: () => {
      const { activeGenerations } = get();
      return Object.values(activeGenerations).filter(gen => config.isActive(gen));
    },
  }));

  return { store, completedRequestIds };
}
