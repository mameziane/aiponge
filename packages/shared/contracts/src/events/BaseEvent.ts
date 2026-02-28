/**
 * Base Event Schema
 *
 * Shared base event structure for all cross-service communication
 */

import { z } from 'zod';

// Base event structure for all platform events
export const baseEventSchema = z.object({
  eventId: z.string(),
  correlationId: z.string(),
  timestamp: z.string(),
  version: z.string().default('1.0'),
  source: z.string(),
});

// Base event type
export type BaseEvent = z.infer<typeof baseEventSchema>;

// Helper function to create event IDs
export function generateEventId(prefix: string = 'evt'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Helper function to create base event structure
export function createBaseEvent(
  type: string,
  source: string,
  options?: { eventId?: string; correlationId?: string }
): Omit<BaseEvent & { type: string }, 'data'> {
  return {
    eventId: options?.eventId || generateEventId(),
    correlationId: options?.correlationId || `cor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
  };
}
