/**
 * Config Event Subscriber
 * Handles config.template.* and config.provider.* events from AI Config Service
 * Replaces HTTP-based template sync with event-driven updates
 */

import { createEventSubscriber, type StandardEvent, type EventHandler } from '@aiponge/platform-core';
import { getLogger } from '../../config/service-urls';
import { eq } from 'drizzle-orm';
import { getDatabase } from '../database/DatabaseConnectionFactory';
import { contentFeedback, contentRequests } from '../../schema/content-schema';

const logger = getLogger('ai-content-config-subscriber');

interface TemplateEventData {
  templateId: string;
  templateKey: string;
  category: string;
  version?: string;
  changes?: string[];
}

interface ProviderEventData {
  providerId: string;
  providerName: string;
  enabled?: boolean;
  priority?: number;
  previousStatus?: string;
  currentStatus?: string;
  reason?: string;
}

const templateCache = new Map<string, { templateId: string; version: string; updatedAt: number }>();
const providerStatus = new Map<string, { status: string; updatedAt: number }>();

async function handleTemplateCreated(_event: StandardEvent, data: TemplateEventData): Promise<void> {
  logger.info('Template created: {} ({})', { data0: data.templateKey, data1: data.category });
  templateCache.set(data.templateKey, {
    templateId: data.templateId,
    version: data.version || '1.0.0',
    updatedAt: Date.now(),
  });
}

async function handleTemplateUpdated(_event: StandardEvent, data: TemplateEventData): Promise<void> {
  logger.info('Template updated: {} version {} changes: {}', {
    data0: data.templateKey,
    data1: data.version || 'unknown',
    data2: data.changes?.join(', ') || 'none',
  });
  templateCache.set(data.templateKey, {
    templateId: data.templateId,
    version: data.version || '1.0.0',
    updatedAt: Date.now(),
  });
}

async function handleTemplateDeleted(_event: StandardEvent, data: TemplateEventData): Promise<void> {
  logger.info('Template deleted: {}', { data0: data.templateKey });
  templateCache.delete(data.templateKey);
}

async function handleProviderUpdated(_event: StandardEvent, data: ProviderEventData): Promise<void> {
  logger.info('Provider updated: {} enabled={} priority={}', {
    data0: data.providerName,
    data1: String(data.enabled),
    data2: String(data.priority),
  });
}

interface UserDeletedEventData {
  userId: string;
}

async function handleUserDeleted(_event: StandardEvent, data: UserDeletedEventData): Promise<void> {
  const { userId } = data;
  try {
    const db = getDatabase();
    await db.delete(contentFeedback).where(eq(contentFeedback.userId, userId));
    await db.delete(contentRequests).where(eq(contentRequests.userId, userId));
    logger.info('User data deleted for GDPR compliance: {}', { data0: userId });
  } catch (error) {
    logger.error('Failed to delete user data for user: {}', {
      data0: userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function handleProviderHealthChanged(_event: StandardEvent, data: ProviderEventData): Promise<void> {
  logger.info('Provider health changed: {} {} -> {}', {
    data0: data.providerName,
    data1: data.previousStatus || 'unknown',
    data2: data.currentStatus || 'unknown',
  });
  if (data.currentStatus) {
    providerStatus.set(data.providerName, {
      status: data.currentStatus,
      updatedAt: Date.now(),
    });
  }
}

let subscriber: ReturnType<typeof createEventSubscriber> | null = null;

export async function startConfigEventSubscriber(): Promise<void> {
  if (subscriber) return;

  subscriber = createEventSubscriber('ai-content-service')
    .register({
      eventType: 'config.template.created',
      handler: handleTemplateCreated as unknown as EventHandler,
    })
    .register({
      eventType: 'config.template.updated',
      handler: handleTemplateUpdated as unknown as EventHandler,
    })
    .register({
      eventType: 'config.template.deleted',
      handler: handleTemplateDeleted as unknown as EventHandler,
    })
    .register({
      eventType: 'config.provider.updated',
      handler: handleProviderUpdated as unknown as EventHandler,
    })
    .register({
      eventType: 'config.provider.health_changed',
      handler: handleProviderHealthChanged as unknown as EventHandler,
    })
    .register({
      eventType: 'user.deleted',
      handler: handleUserDeleted as unknown as EventHandler,
    });

  await subscriber.start();
  logger.debug('Config event subscriber started for AI Content Service');
}

export async function stopConfigEventSubscriber(): Promise<void> {
  if (subscriber) {
    await subscriber.shutdown();
    subscriber = null;
  }
}

export function getTemplateCache(): Map<string, { templateId: string; version: string; updatedAt: number }> {
  return templateCache;
}

export function getProviderStatus(): Map<string, { status: string; updatedAt: number }> {
  return providerStatus;
}
