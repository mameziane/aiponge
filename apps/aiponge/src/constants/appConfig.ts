/**
 * Runtime Configuration
 * Centralized constants and configuration values
 *
 * These values were previously scattered across the codebase.
 * Centralizing them reduces maintenance burden and makes changes easier.
 */

export const CONFIG = {
  app: {
    name: 'aiponge',
    albumName: 'aiponge Music',
    defaultDisplayName: 'You',
  },

  api: {
    timeoutMs: 15000,
    generationTimeoutMs: 120000,
    cacheDefaultTtlMs: 300000,
  },

  retry: {
    maxRetries: 3,
    delayMs: 5000,
    backoffMultiplier: 2,
  },

  playback: {
    positionSyncIntervalMs: 5000,
    endThresholdSeconds: 1,
    skipBackThresholdSeconds: 3,
  },

  cache: {
    profileTtlMs: 300000,
    booksTtlMs: 300000,
    tracksTtlMs: 60000,
  },

  notifications: {
    retryDelayMs: 5000,
    maxRetries: 3,
  },

  query: {
    staleTime: {
      default: 5 * 60 * 1000,
      short: 30 * 1000,
      medium: 60 * 1000,
      long: 5 * 60 * 1000,
    },
    gcTime: {
      default: 5 * 60 * 1000,
      short: 60 * 1000,
      long: 10 * 60 * 1000,
    },
    refetchInterval: {
      realtime: 15 * 1000,
      frequent: 30 * 1000,
      normal: 60 * 1000,
      slow: 2 * 60 * 1000,
      background: 5 * 60 * 1000,
    },
  },

  ui: {
    delays: {
      debounceMs: 150,
      toastDurationMs: 2000,
      refreshIndicatorMs: 500,
      balanceRefreshMs: 1000,
      navigationDelayMs: 500,
    },
    polling: {
      statusCheckMs: 5000,
    },
  },

  admin: {
    query: {
      staleTime: {
        fast: 5 * 1000,
        normal: 10 * 1000,
        slow: 30 * 1000,
        background: 60 * 1000,
      },
      refetchInterval: {
        realtime: 15 * 1000,
        fast: 30 * 1000,
        normal: 60 * 1000,
        slow: 2 * 60 * 1000,
      },
    },
  },
} as const;

export type AppConfig = typeof CONFIG;

export const QUERY_STALE_TIME = CONFIG.query.staleTime;
export const QUERY_GC_TIME = CONFIG.query.gcTime;
export const QUERY_REFETCH_INTERVAL = CONFIG.query.refetchInterval;
export const UI_DELAYS = CONFIG.ui.delays;
export const ADMIN_QUERY = CONFIG.admin.query;
