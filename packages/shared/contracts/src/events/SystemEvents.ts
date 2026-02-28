/**
 * System Service Event Contracts
 * Events for system alerts and monitoring
 * Used to decouple System Service ↔ API Gateway circular dependency
 */

import { z } from 'zod';
import { baseEventSchema, generateEventId } from './BaseEvent.js';

export type SystemEventType =
  | 'system.alert.raised'
  | 'system.alert.resolved'
  | 'system.health.degraded'
  | 'system.health.recovered'
  | 'system.maintenance.scheduled'
  | 'system.maintenance.started'
  | 'system.maintenance.completed';

export const systemAlertRaisedEventSchema = baseEventSchema.extend({
  type: z.literal('system.alert.raised'),
  data: z.object({
    alertId: z.string(),
    severity: z.enum(['info', 'warning', 'error', 'critical']),
    service: z.string(),
    title: z.string(),
    message: z.string(),
    metadata: z.record(z.unknown()).optional(),
  }),
});

export const systemAlertResolvedEventSchema = baseEventSchema.extend({
  type: z.literal('system.alert.resolved'),
  data: z.object({
    alertId: z.string(),
    service: z.string(),
    resolvedBy: z.string().optional(),
    resolution: z.string().optional(),
  }),
});

export const systemHealthDegradedEventSchema = baseEventSchema.extend({
  type: z.literal('system.health.degraded'),
  data: z.object({
    service: z.string(),
    component: z.string().optional(),
    previousStatus: z.string(),
    currentStatus: z.string(),
    reason: z.string(),
    affectedEndpoints: z.array(z.string()).optional(),
  }),
});

export const systemHealthRecoveredEventSchema = baseEventSchema.extend({
  type: z.literal('system.health.recovered'),
  data: z.object({
    service: z.string(),
    component: z.string().optional(),
    previousStatus: z.string(),
    currentStatus: z.string(),
    recoveryDuration: z.number().optional(),
  }),
});

export const systemMaintenanceScheduledEventSchema = baseEventSchema.extend({
  type: z.literal('system.maintenance.scheduled'),
  data: z.object({
    maintenanceId: z.string(),
    scheduledStart: z.string(),
    estimatedDuration: z.number(),
    affectedServices: z.array(z.string()),
    description: z.string(),
  }),
});

export const systemMaintenanceStartedEventSchema = baseEventSchema.extend({
  type: z.literal('system.maintenance.started'),
  data: z.object({
    maintenanceId: z.string(),
    affectedServices: z.array(z.string()),
  }),
});

export const systemMaintenanceCompletedEventSchema = baseEventSchema.extend({
  type: z.literal('system.maintenance.completed'),
  data: z.object({
    maintenanceId: z.string(),
    actualDuration: z.number(),
    outcome: z.enum(['success', 'partial', 'failed']),
    notes: z.string().optional(),
  }),
});

export const systemEventSchema = z.discriminatedUnion('type', [
  systemAlertRaisedEventSchema,
  systemAlertResolvedEventSchema,
  systemHealthDegradedEventSchema,
  systemHealthRecoveredEventSchema,
  systemMaintenanceScheduledEventSchema,
  systemMaintenanceStartedEventSchema,
  systemMaintenanceCompletedEventSchema,
]);

export type SystemAlertRaisedEvent = z.infer<typeof systemAlertRaisedEventSchema>;
export type SystemAlertResolvedEvent = z.infer<typeof systemAlertResolvedEventSchema>;
export type SystemHealthDegradedEvent = z.infer<typeof systemHealthDegradedEventSchema>;
export type SystemHealthRecoveredEvent = z.infer<typeof systemHealthRecoveredEventSchema>;
export type SystemMaintenanceScheduledEvent = z.infer<typeof systemMaintenanceScheduledEventSchema>;
export type SystemMaintenanceStartedEvent = z.infer<typeof systemMaintenanceStartedEventSchema>;
export type SystemMaintenanceCompletedEvent = z.infer<typeof systemMaintenanceCompletedEventSchema>;
export type SystemEvent = z.infer<typeof systemEventSchema>;

export function createSystemEvent<T extends SystemEvent['type']>(
  type: T,
  data: Extract<SystemEvent, { type: T }>['data'],
  source: string = 'system-service',
  options?: { correlationId?: string }
): Extract<SystemEvent, { type: T }> {
  return {
    eventId: generateEventId('sys'),
    correlationId: options?.correlationId || generateEventId('cor'),
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
    data,
  } as Extract<SystemEvent, { type: T }>;
}

export function validateSystemEvent(event: unknown): SystemEvent {
  return systemEventSchema.parse(event);
}
