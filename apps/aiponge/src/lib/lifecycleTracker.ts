/**
 * Lifecycle Tracker
 * Tracks user lifecycle events (sessions, features, content generation, onboarding)
 * and batches them to the ai-analytics-service REST API.
 *
 * Supports offline queuing via AsyncStorage — events are persisted on flush failure
 * and retried on next app foreground.
 *
 * Auto-tracks session_started/session_ended via AppState listeners.
 * All calls are fire-and-forget — failures never surface to the user.
 */

import { AppState, type AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './axiosApiClient';
import { logger } from './logger';

// ─── Constants ────────────────────────────────────────────────────────────────

const LIFECYCLE_BATCH_ENDPOINT = '/api/v1/analytics/lifecycle/events/batch';
const LIFECYCLE_SINGLE_ENDPOINT = '/api/v1/analytics/lifecycle/event';
const LIFECYCLE_STORAGE_KEY = 'aiponge_lifecycle_queue';
const LIFECYCLE_BATCH_INTERVAL_MS = 5_000;
const LIFECYCLE_MAX_QUEUE_SIZE = 50;
const LIFECYCLE_MAX_BATCH_SIZE = 100;

// ─── Types ────────────────────────────────────────────────────────────────────

interface LifecycleEventParams {
  eventType: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  occurredAt: string;
}

// ─── Module State ─────────────────────────────────────────────────────────────

let eventQueue: LifecycleEventParams[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let sessionStartTime: number | null = null;
let currentSessionId: string | null = null;
let appStateSubscription: { remove(): void } | null = null;
let initialized = false;

const platform = Platform.OS as 'ios' | 'android';

// ─── Queue Management ─────────────────────────────────────────────────────────

function enqueue(event: LifecycleEventParams): void {
  eventQueue.push(event);
  if (eventQueue.length >= LIFECYCLE_MAX_QUEUE_SIZE) {
    flush();
  } else {
    scheduleFlush();
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, LIFECYCLE_BATCH_INTERVAL_MS);
}

function flush(): void {
  if (eventQueue.length === 0) return;
  const events = eventQueue.splice(0, LIFECYCLE_MAX_BATCH_SIZE);

  apiClient
    .post(LIFECYCLE_BATCH_ENDPOINT, {
      events: events.map(e => ({
        eventType: e.eventType,
        metadata: e.metadata ?? {},
        sessionId: e.sessionId,
        platform,
        occurredAt: e.occurredAt,
      })),
    })
    .catch(() => {
      // Persist failed events to AsyncStorage for offline retry
      persistToStorage(events).catch(() => {});
    });

  if (eventQueue.length > 0) {
    scheduleFlush();
  }
}

// ─── Offline Persistence ──────────────────────────────────────────────────────

async function persistToStorage(events: LifecycleEventParams[]): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(LIFECYCLE_STORAGE_KEY);
    const existing: LifecycleEventParams[] = stored ? JSON.parse(stored) : [];
    const merged = [...existing, ...events].slice(-LIFECYCLE_MAX_BATCH_SIZE);
    await AsyncStorage.setItem(LIFECYCLE_STORAGE_KEY, JSON.stringify(merged));
    logger.debug('[LifecycleTracker] Persisted events to offline storage', { count: events.length });
  } catch {
    // Storage failures are non-critical
  }
}

async function drainOfflineQueue(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(LIFECYCLE_STORAGE_KEY);
    if (!stored) return;

    const events: LifecycleEventParams[] = JSON.parse(stored);
    if (events.length === 0) return;

    await AsyncStorage.removeItem(LIFECYCLE_STORAGE_KEY);

    // Re-enqueue offline events for batch flush
    for (const event of events) {
      eventQueue.push(event);
    }
    logger.debug('[LifecycleTracker] Drained offline queue', { count: events.length });

    if (eventQueue.length > 0) {
      flush();
    }
  } catch {
    // Offline drain failures are non-critical
  }
}

// ─── Session Tracking ─────────────────────────────────────────────────────────

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function handleAppStateChange(nextState: AppStateStatus): void {
  try {
    if (nextState === 'active') {
      // App came to foreground — start session
      sessionStartTime = Date.now();
      currentSessionId = generateSessionId();

      enqueue({
        eventType: 'user.session_started',
        metadata: {},
        sessionId: currentSessionId,
        occurredAt: new Date().toISOString(),
      });

      // Drain any events queued while offline
      drainOfflineQueue().catch(() => {});
    } else if (nextState === 'background' && sessionStartTime != null) {
      // App going to background — end session with duration
      const durationSeconds = Math.round((Date.now() - sessionStartTime) / 1000);

      enqueue({
        eventType: 'user.session_ended',
        metadata: { durationSeconds },
        sessionId: currentSessionId ?? undefined,
        occurredAt: new Date().toISOString(),
      });

      sessionStartTime = null;

      // Force flush before going to background
      flushLifecycleEvents();
    }
  } catch {
    // Never crash from analytics
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initialize lifecycle tracking — call once at app startup.
 * Sets up AppState listeners for automatic session tracking.
 */
export function initLifecycleTracker(): void {
  if (initialized) return;
  initialized = true;

  appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

  // If app is already active when initialized, start a session
  if (AppState.currentState === 'active') {
    sessionStartTime = Date.now();
    currentSessionId = generateSessionId();
    enqueue({
      eventType: 'user.session_started',
      metadata: {},
      sessionId: currentSessionId,
      occurredAt: new Date().toISOString(),
    });
  }

  // Drain any offline events from previous session
  drainOfflineQueue().catch(() => {});

  logger.debug('[LifecycleTracker] Initialized');
}

/**
 * Track a feature usage event.
 */
export function trackFeatureUsed(
  feature: string,
  extra?: { subFeature?: string; durationSeconds?: number; resultType?: string }
): void {
  try {
    enqueue({
      eventType: 'user.feature_used',
      metadata: { feature, ...extra },
      sessionId: currentSessionId ?? undefined,
      occurredAt: new Date().toISOString(),
    });
  } catch {
    // Never throw from analytics
  }
}

/**
 * Track a content generation event.
 */
export function trackContentGenerated(
  contentType: 'music' | 'art' | 'affirmation' | 'chat',
  extra?: { promptTokens?: number; cost?: number }
): void {
  try {
    enqueue({
      eventType: 'user.content_generated',
      metadata: { contentType, ...extra },
      sessionId: currentSessionId ?? undefined,
      occurredAt: new Date().toISOString(),
    });
  } catch {
    // Never throw from analytics
  }
}

/**
 * Track an onboarding step completion.
 */
export function trackOnboardingStep(step: string, stepIndex: number, totalSteps: number, completed: boolean): void {
  try {
    const eventType = completed ? 'user.onboarding_completed' : 'user.onboarding_step';
    const metadata = completed
      ? { durationMinutes: 0, stepsCompleted: totalSteps }
      : { step, stepIndex, totalSteps, completed };

    enqueue({
      eventType,
      metadata,
      sessionId: currentSessionId ?? undefined,
      occurredAt: new Date().toISOString(),
    });
  } catch {
    // Never throw from analytics
  }
}

/**
 * Force-flush all queued lifecycle events immediately.
 * Call before app backgrounding or logout.
 */
export function flushLifecycleEvents(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush();
}

/**
 * Clean up AppState listener and flush remaining events.
 * Call on app teardown / logout.
 */
export function teardownLifecycleTracker(): void {
  flushLifecycleEvents();
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
  initialized = false;
  logger.debug('[LifecycleTracker] Torn down');
}
