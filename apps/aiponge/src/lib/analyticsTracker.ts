/**
 * Analytics Tracker
 * Sends user activity events to ai-analytics-service via the API Gateway.
 * All calls are fire-and-forget — failures never surface to the user.
 */

import { apiClient } from './axiosApiClient';
import { logger } from './logger';

const TRACK_ENDPOINT = '/api/v1/app/analytics/track';

interface TrackEventParams {
  eventType: string;
  eventData?: Record<string, unknown>;
  userId?: string;
}

// In-memory queue to batch events and avoid spamming the server
let eventQueue: TrackEventParams[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const BATCH_INTERVAL_MS = 5_000;
const MAX_QUEUE_SIZE = 20;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, BATCH_INTERVAL_MS);
}

function flush(): void {
  if (eventQueue.length === 0) return;
  const events = eventQueue.splice(0, MAX_QUEUE_SIZE);

  // Send each event individually (the backend expects single events)
  for (const event of events) {
    apiClient
      .post(TRACK_ENDPOINT, {
        eventType: event.eventType,
        eventData: event.eventData,
        userId: event.userId,
      })
      .catch(() => {
        // Silently ignore analytics failures
      });
  }

  // If there are remaining events, schedule another flush
  if (eventQueue.length > 0) {
    scheduleFlush();
  }
}

/**
 * Track a user activity event. Fire-and-forget.
 */
export function trackEvent(eventType: string, eventData?: Record<string, unknown>, userId?: string): void {
  try {
    eventQueue.push({ eventType, eventData, userId });

    if (eventQueue.length >= MAX_QUEUE_SIZE) {
      flush();
    } else {
      scheduleFlush();
    }
  } catch {
    // Never throw from analytics
  }
}

// Convenience helpers for common events

export function trackScreenView(screenName: string, userId?: string): void {
  trackEvent('screen_view', { resource: screenName }, userId);
}

export function trackContentGeneration(
  contentType: 'music' | 'lyrics' | 'affirmation' | 'artwork',
  userId?: string,
  extra?: Record<string, unknown>
): void {
  trackEvent('content_generation_requested', { resource: contentType, ...extra }, userId);
}

export function trackPlayback(action: 'play' | 'pause' | 'complete' | 'skip', trackId: string, userId?: string): void {
  trackEvent(`playback_${action}`, { resource: 'track', trackId }, userId);
}

export function trackLibraryAction(
  action: 'entry_created' | 'entry_deleted' | 'chapter_created' | 'book_created',
  userId?: string,
  extra?: Record<string, unknown>
): void {
  trackEvent(`library_${action}`, { resource: 'library', ...extra }, userId);
}

export function trackSubscriptionAction(action: string, tier?: string, userId?: string): void {
  trackEvent('subscription_action', { action, tier, resource: 'subscription' }, userId);
}

/**
 * Force-flush any pending events (call on app background/close).
 */
export function flushAnalytics(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flush();
}

logger.debug('[Analytics] Tracker initialized');
