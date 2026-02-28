/**
 * AI Config Service Event Contracts
 * Events for template and provider configuration changes
 * Used to decouple AI Config ↔ AI Content circular dependency
 */

import { z } from 'zod';
import { baseEventSchema, generateEventId } from './BaseEvent.js';

export type ConfigEventType =
  | 'config.template.created'
  | 'config.template.updated'
  | 'config.template.deleted'
  | 'config.provider.updated'
  | 'config.provider.health_changed';

export const configTemplateCreatedEventSchema = baseEventSchema.extend({
  type: z.literal('config.template.created'),
  data: z.object({
    templateId: z.string(),
    templateKey: z.string(),
    category: z.string(),
    version: z.string().optional(),
  }),
});

export const configTemplateUpdatedEventSchema = baseEventSchema.extend({
  type: z.literal('config.template.updated'),
  data: z.object({
    templateId: z.string(),
    templateKey: z.string(),
    category: z.string(),
    version: z.string().optional(),
    changes: z.array(z.string()).optional(),
  }),
});

export const configTemplateDeletedEventSchema = baseEventSchema.extend({
  type: z.literal('config.template.deleted'),
  data: z.object({
    templateId: z.string(),
    templateKey: z.string(),
  }),
});

export const configProviderUpdatedEventSchema = baseEventSchema.extend({
  type: z.literal('config.provider.updated'),
  data: z.object({
    providerId: z.string(),
    providerName: z.string(),
    enabled: z.boolean(),
    priority: z.number().optional(),
  }),
});

export const configProviderHealthChangedEventSchema = baseEventSchema.extend({
  type: z.literal('config.provider.health_changed'),
  data: z.object({
    providerId: z.string(),
    providerName: z.string(),
    previousStatus: z.enum(['healthy', 'degraded', 'unhealthy']),
    currentStatus: z.enum(['healthy', 'degraded', 'unhealthy']),
    reason: z.string().optional(),
  }),
});

export const configEventSchema = z.discriminatedUnion('type', [
  configTemplateCreatedEventSchema,
  configTemplateUpdatedEventSchema,
  configTemplateDeletedEventSchema,
  configProviderUpdatedEventSchema,
  configProviderHealthChangedEventSchema,
]);

export type ConfigTemplateCreatedEvent = z.infer<typeof configTemplateCreatedEventSchema>;
export type ConfigTemplateUpdatedEvent = z.infer<typeof configTemplateUpdatedEventSchema>;
export type ConfigTemplateDeletedEvent = z.infer<typeof configTemplateDeletedEventSchema>;
export type ConfigProviderUpdatedEvent = z.infer<typeof configProviderUpdatedEventSchema>;
export type ConfigProviderHealthChangedEvent = z.infer<typeof configProviderHealthChangedEventSchema>;
export type ConfigEvent = z.infer<typeof configEventSchema>;

export function createConfigEvent<T extends ConfigEvent['type']>(
  type: T,
  data: Extract<ConfigEvent, { type: T }>['data'],
  source: string = 'ai-config-service',
  options?: { correlationId?: string }
): Extract<ConfigEvent, { type: T }> {
  return {
    eventId: generateEventId('cfg'),
    correlationId: options?.correlationId || generateEventId('cor'),
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
    data,
  } as Extract<ConfigEvent, { type: T }>;
}

export function validateConfigEvent(event: unknown): ConfigEvent {
  return configEventSchema.parse(event);
}
