/**
 * Orchestration Flow event contracts for cross-service communication.
 * Generic events with flowType discriminator — one namespace for all agentic flows.
 */

import { z } from 'zod';
import { baseEventSchema, generateEventId } from './BaseEvent.js';
import { ContentVisibilitySchema } from '../common/index.js';

// Orchestration Flow Types — extensible for future agentic flows
export const OrchestrationFlowTypeSchema = z.enum(['wellness', 'meditation', 'gift', 'journal']);
export type OrchestrationFlowType = z.infer<typeof OrchestrationFlowTypeSchema>;

// Event Types
export type OrchestrationEventType =
  | 'orchestration.flow.planned'
  | 'orchestration.flow.confirmed'
  | 'orchestration.flow.book_requested'
  | 'orchestration.flow.content_ready'
  | 'orchestration.flow.completed'
  | 'orchestration.flow.delivered';

// --- Planned Event (for analytics) ---

export const orchestrationFlowPlannedEventSchema = baseEventSchema.extend({
  type: z.literal('orchestration.flow.planned'),
  data: z.object({
    flowType: OrchestrationFlowTypeSchema,
    sessionId: z.string(),
    creatorId: z.string().uuid(),
    recipientId: z.string().uuid(),
    recipientIsSelf: z.boolean(),
  }),
});

export type OrchestrationFlowPlannedEvent = z.infer<typeof orchestrationFlowPlannedEventSchema>;

// --- Confirmed Event ---

export const orchestrationFlowConfirmedEventSchema = baseEventSchema.extend({
  type: z.literal('orchestration.flow.confirmed'),
  data: z.object({
    flowType: OrchestrationFlowTypeSchema,
    sessionId: z.string(),
    previewTrackId: z.string().uuid(),
    creatorId: z.string().uuid(),
    recipientId: z.string().uuid(),
    recipientIsSelf: z.boolean(),
    visibility: ContentVisibilitySchema,
    dedicatedToMemberId: z.string().uuid().nullable(),
  }),
});

export type OrchestrationFlowConfirmedEvent = z.infer<typeof orchestrationFlowConfirmedEventSchema>;

// --- Book Requested Event ---

export const orchestrationFlowBookRequestedEventSchema = baseEventSchema.extend({
  type: z.literal('orchestration.flow.book_requested'),
  data: z.object({
    flowType: OrchestrationFlowTypeSchema,
    sessionId: z.string(),
    creatorId: z.string().uuid(),
    recipientId: z.string().uuid(),
    recipientIsSelf: z.boolean(),
    visibility: ContentVisibilitySchema,
    dedicatedToMemberId: z.string().uuid().nullable(),
    previewTrackId: z.string().uuid(),
    bookParams: z.object({
      bookTypeId: z.string(),
      chapterThemes: z.array(z.string()),
      suggestedTitle: z.string(),
      language: z.string().optional(),
      tone: z.enum(['supportive', 'challenging', 'neutral']).optional(),
      depthLevel: z.enum(['brief', 'standard', 'deep']).optional(),
    }),
    albumPlan: z.object({
      suggestedTitle: z.string(),
      trackCount: z.number().int().min(1).max(20),
      genres: z.array(z.string()),
      mood: z.string(),
      style: z.string(),
    }),
  }),
});

export type OrchestrationFlowBookRequestedEvent = z.infer<typeof orchestrationFlowBookRequestedEventSchema>;

// --- Content Ready Event (discriminated by contentType) ---

const contentReadyBaseData = z.object({
  flowType: OrchestrationFlowTypeSchema,
  sessionId: z.string(),
  creatorId: z.string().uuid(),
  recipientId: z.string().uuid(),
  recipientIsSelf: z.boolean(),
  visibility: ContentVisibilitySchema,
  dedicatedToMemberId: z.string().uuid().nullable(),
  status: z.enum(['completed', 'failed']),
  errorMessage: z.string().optional(),
});

export const orchestrationFlowContentReadyBookEventSchema = baseEventSchema.extend({
  type: z.literal('orchestration.flow.content_ready'),
  data: contentReadyBaseData.extend({
    contentType: z.literal('book'),
    contentId: z.string().uuid(),
    previewTrackId: z.string().uuid(),
    bookMetadata: z.object({
      bookId: z.string().uuid(),
      bookTitle: z.string(),
      bookType: z.string(),
      bookDescription: z.string().optional(),
      bookThemes: z.array(z.string()).optional(),
    }),
    entries: z.array(
      z.object({
        entryId: z.string().uuid(),
        content: z.string(),
        chapterTitle: z.string().optional(),
        order: z.number().int(),
      })
    ),
    albumPlan: z.object({
      suggestedTitle: z.string(),
      trackCount: z.number().int(),
      genres: z.array(z.string()),
      mood: z.string(),
      style: z.string(),
    }),
  }),
});

export const orchestrationFlowContentReadyAlbumEventSchema = baseEventSchema.extend({
  type: z.literal('orchestration.flow.content_ready'),
  data: contentReadyBaseData.extend({
    contentType: z.literal('album'),
    contentId: z.string().uuid(),
    albumId: z.string().uuid(),
    albumRequestId: z.string(),
  }),
});

export type OrchestrationFlowContentReadyBookEvent = z.infer<typeof orchestrationFlowContentReadyBookEventSchema>;
export type OrchestrationFlowContentReadyAlbumEvent = z.infer<typeof orchestrationFlowContentReadyAlbumEventSchema>;
export type OrchestrationFlowContentReadyEvent =
  | OrchestrationFlowContentReadyBookEvent
  | OrchestrationFlowContentReadyAlbumEvent;

// --- Completed Event ---

export const orchestrationFlowCompletedEventSchema = baseEventSchema.extend({
  type: z.literal('orchestration.flow.completed'),
  data: z.object({
    flowType: OrchestrationFlowTypeSchema,
    sessionId: z.string(),
    creatorId: z.string().uuid(),
    recipientId: z.string().uuid(),
    recipientIsSelf: z.boolean(),
    status: z.enum(['completed', 'failed']),
    errorMessage: z.string().optional(),
    outputs: z
      .object({
        albumId: z.string().uuid().nullable(),
        bookId: z.string().uuid().nullable(),
        albumTitle: z.string().nullable().optional(),
        bookTitle: z.string().nullable().optional(),
      })
      .optional(),
  }),
});

export type OrchestrationFlowCompletedEvent = z.infer<typeof orchestrationFlowCompletedEventSchema>;

// --- Delivered Event (for analytics) ---

export const orchestrationFlowDeliveredEventSchema = baseEventSchema.extend({
  type: z.literal('orchestration.flow.delivered'),
  data: z.object({
    flowType: OrchestrationFlowTypeSchema,
    sessionId: z.string(),
    recipientId: z.string().uuid(),
    deliveredAt: z.string(),
  }),
});

export type OrchestrationFlowDeliveredEvent = z.infer<typeof orchestrationFlowDeliveredEventSchema>;

// --- Union Type ---

export type OrchestrationEvent =
  | OrchestrationFlowPlannedEvent
  | OrchestrationFlowConfirmedEvent
  | OrchestrationFlowBookRequestedEvent
  | OrchestrationFlowContentReadyBookEvent
  | OrchestrationFlowContentReadyAlbumEvent
  | OrchestrationFlowCompletedEvent
  | OrchestrationFlowDeliveredEvent;

// --- Helper Functions ---

function generateOrchestrationEventId(): string {
  return `orch_evt_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function generateCorrelationId(): string {
  return `cor_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function createOrchestrationEvent<T extends OrchestrationEvent['type']>(
  type: T,
  data: Extract<OrchestrationEvent, { type: T }>['data'],
  source: string,
  options?: { correlationId?: string }
): Extract<OrchestrationEvent, { type: T }> {
  return {
    eventId: generateOrchestrationEventId(),
    correlationId: options?.correlationId || generateCorrelationId(),
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
    data,
  } as Extract<OrchestrationEvent, { type: T }>;
}

// --- Validation ---

export function isOrchestrationEvent(event: unknown): event is OrchestrationEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    'type' in event &&
    typeof (event as { type: unknown }).type === 'string' &&
    (event as { type: string }).type.startsWith('orchestration.flow.')
  );
}
