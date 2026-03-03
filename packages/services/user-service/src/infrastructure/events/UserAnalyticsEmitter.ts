/**
 * UserAnalyticsEmitter - Publishes user activity events to the analytics event bus
 * These events are consumed by ai-analytics-service and persisted to aia_user_activity_logs
 */

import { getAnalyticsEventPublisher, type AnalyticsEventPublisher } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('user-service-analytics-emitter');

let publisher: AnalyticsEventPublisher | null = null;

function getPublisher(): AnalyticsEventPublisher {
  if (!publisher) {
    publisher = getAnalyticsEventPublisher('user-service');
  }
  return publisher;
}

export const UserAnalyticsEmitter = {
  userLoggedIn(userId: string, sessionId?: string, userAgent?: string): void {
    try {
      getPublisher().recordEvent({
        eventType: 'user_login',
        userId,
        eventData: { sessionId, userAgent },
        metadata: { service: 'user-service' },
      });
    } catch (error) {
      logger.debug('Failed to emit user_login analytics (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  userRegistered(userId: string, userType: string): void {
    try {
      getPublisher().recordEvent({
        eventType: 'user_registered',
        userId,
        eventData: { userType },
        metadata: { service: 'user-service' },
      });
    } catch (error) {
      logger.debug('Failed to emit user_registered analytics (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  profileUpdated(userId: string, updatedFields: string[]): void {
    try {
      getPublisher().recordEvent({
        eventType: 'profile_updated',
        userId,
        eventData: { updatedFields: updatedFields.join(',') },
        metadata: { service: 'user-service' },
      });
    } catch (error) {
      logger.debug('Failed to emit profile_updated analytics (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  libraryEntryCreated(userId: string, entryType?: string): void {
    try {
      getPublisher().recordEvent({
        eventType: 'library_entry_created',
        userId,
        eventData: { resource: 'library_entry', entityType: entryType },
        metadata: { service: 'user-service' },
      });
    } catch (error) {
      logger.debug('Failed to emit library_entry_created analytics (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  libraryEntryDeleted(userId: string): void {
    try {
      getPublisher().recordEvent({
        eventType: 'library_entry_deleted',
        userId,
        eventData: { resource: 'library_entry' },
        metadata: { service: 'user-service' },
      });
    } catch (error) {
      logger.debug('Failed to emit library_entry_deleted analytics (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  insightCreated(userId: string): void {
    try {
      getPublisher().recordEvent({
        eventType: 'insight_created',
        userId,
        eventData: { resource: 'insight' },
        metadata: { service: 'user-service' },
      });
    } catch (error) {
      logger.debug('Failed to emit insight_created analytics (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  reflectionCreated(userId: string): void {
    try {
      getPublisher().recordEvent({
        eventType: 'reflection_created',
        userId,
        eventData: { resource: 'reflection' },
        metadata: { service: 'user-service' },
      });
    } catch (error) {
      logger.debug('Failed to emit reflection_created analytics (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  moodCheckIn(userId: string, mood?: string): void {
    try {
      getPublisher().recordEvent({
        eventType: 'mood_check_in',
        userId,
        eventData: { resource: 'mood', mood },
        metadata: { service: 'user-service' },
      });
    } catch (error) {
      logger.debug('Failed to emit mood_check_in analytics (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  subscriptionChanged(userId: string, tier: string, action: 'upgraded' | 'downgraded' | 'cancelled'): void {
    try {
      getPublisher().recordEvent({
        eventType: 'subscription_changed',
        userId,
        eventData: { tier, action, resource: 'subscription' },
        metadata: { service: 'user-service' },
      });
    } catch (error) {
      logger.debug('Failed to emit subscription_changed analytics (non-blocking)', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
