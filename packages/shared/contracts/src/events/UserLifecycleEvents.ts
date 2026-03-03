/**
 * User Lifecycle Event Contracts
 * Events for tracking user lifecycle, subscription changes, and engagement analytics.
 * Consumed by ai-analytics-service for business metrics (MRR, churn, cohort retention, LTV).
 */

import { z } from 'zod';
import { baseEventSchema, generateEventId } from './BaseEvent.js';

// ─── Channel ───────────────────────────────────────────────────────────────────

export const USER_LIFECYCLE_CHANNEL = 'user:lifecycle';

// ─── Event Type Constants ──────────────────────────────────────────────────────

export const USER_LIFECYCLE_EVENT_TYPES = {
  SIGNED_UP: 'user.signed_up',
  ONBOARDING_STEP: 'user.onboarding_step',
  ONBOARDING_COMPLETED: 'user.onboarding_completed',
  SESSION_STARTED: 'user.session_started',
  SESSION_ENDED: 'user.session_ended',
  FEATURE_USED: 'user.feature_used',
  CONTENT_GENERATED: 'user.content_generated',
  TIER_CHANGED: 'user.tier_changed',
  PAYMENT_SUCCEEDED: 'user.payment_succeeded',
  PAYMENT_FAILED: 'user.payment_failed',
  REFUND_PROCESSED: 'user.refund_processed',
  TRIAL_STARTED: 'user.trial_started',
  TRIAL_CONVERTED: 'user.trial_converted',
  TRIAL_EXPIRED: 'user.trial_expired',
  CHURNED: 'user.churned',
  REACTIVATED: 'user.reactivated',
  DORMANT_FLAGGED: 'user.dormant_flagged',
  DELETED: 'user.deleted',
} as const;

export type UserLifecycleEventType = (typeof USER_LIFECYCLE_EVENT_TYPES)[keyof typeof USER_LIFECYCLE_EVENT_TYPES];

// ─── Shared Enums ──────────────────────────────────────────────────────────────

const platformSchema = z.enum(['ios', 'android', 'web']);
const tierSchema = z.enum(['explorer', 'personal', 'practice', 'studio']);
const billingCycleSchema = z.enum(['monthly', 'yearly']);
const storeSchema = z.enum(['apple', 'google']);
const contentTypeSchema = z.enum(['music', 'art', 'affirmation', 'chat']);
const tierChangeTriggerSchema = z.enum(['upgrade', 'downgrade', 'cancellation', 'reactivation']);
const churnReasonSchema = z.enum(['voluntary', 'payment_failure', 'refund', 'inactivity']);

// ─── Individual Event Data Schemas ─────────────────────────────────────────────

const lifecycleBaseFields = {
  userId: z.string(),
  tier: tierSchema.nullable().optional(),
  platform: platformSchema.nullable().optional(),
  sessionId: z.string().nullable().optional(),
};

// user.signed_up
export const userSignedUpEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.SIGNED_UP),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z
      .object({
        acquisitionSource: z.string().optional(),
        campaign: z.string().optional(),
        referralCode: z.string().optional(),
        appVersion: z.string().optional(),
      })
      .default({}),
  }),
});

// user.onboarding_step
export const userOnboardingStepEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.ONBOARDING_STEP),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      step: z.string(),
      stepIndex: z.number(),
      totalSteps: z.number(),
      completed: z.boolean(),
    }),
  }),
});

// user.onboarding_completed
export const userOnboardingCompletedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.ONBOARDING_COMPLETED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      durationMinutes: z.number(),
      stepsCompleted: z.number(),
    }),
  }),
});

// user.session_started
export const userSessionStartedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.SESSION_STARTED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z
      .object({
        appVersion: z.string().optional(),
        deviceModel: z.string().optional(),
        osVersion: z.string().optional(),
      })
      .default({}),
  }),
});

// user.session_ended
export const userSessionEndedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.SESSION_ENDED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      durationSeconds: z.number(),
      screenViews: z.number().optional(),
    }),
  }),
});

// user.feature_used
export const userFeatureUsedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.FEATURE_USED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      feature: z.string(),
      subFeature: z.string().optional(),
      durationSeconds: z.number().optional(),
      resultType: z.string().optional(),
    }),
  }),
});

// user.content_generated
export const userContentGeneratedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.CONTENT_GENERATED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      contentType: contentTypeSchema,
      promptTokens: z.number().optional(),
      cost: z.number().optional(),
    }),
  }),
});

// user.tier_changed
export const userTierChangedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.TIER_CHANGED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      fromTier: tierSchema.nullable(),
      toTier: tierSchema,
      billingCycle: billingCycleSchema.optional(),
      trigger: tierChangeTriggerSchema,
      grossAmount: z.number().optional(),
      netAmount: z.number().optional(),
      store: storeSchema.optional(),
      transactionId: z.string().optional(),
    }),
  }),
});

// user.payment_succeeded
export const userPaymentSucceededEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.PAYMENT_SUCCEEDED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      transactionId: z.string(),
      grossAmount: z.number(),
      currency: z.string(),
      store: storeSchema,
      billingCycle: billingCycleSchema,
      tier: tierSchema,
    }),
  }),
});

// user.payment_failed
export const userPaymentFailedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.PAYMENT_FAILED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      transactionId: z.string().optional(),
      reason: z.string(),
      retryCount: z.number().optional(),
      store: storeSchema.optional(),
    }),
  }),
});

// user.refund_processed
export const userRefundProcessedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.REFUND_PROCESSED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      transactionId: z.string(),
      amount: z.number(),
      reason: z.string().optional(),
    }),
  }),
});

// user.trial_started
export const userTrialStartedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.TRIAL_STARTED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      tier: tierSchema,
      trialDurationDays: z.number(),
    }),
  }),
});

// user.trial_converted
export const userTrialConvertedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.TRIAL_CONVERTED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      tier: tierSchema,
      billingCycle: billingCycleSchema,
    }),
  }),
});

// user.trial_expired
export const userTrialExpiredEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.TRIAL_EXPIRED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      tier: tierSchema,
    }),
  }),
});

// user.churned
export const userChurnedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.CHURNED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      tier: tierSchema,
      reason: churnReasonSchema,
      tenureMonths: z.number().optional(),
    }),
  }),
});

// user.reactivated
export const userReactivatedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.REACTIVATED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      previousTier: tierSchema,
      newTier: tierSchema,
      daysSinceChurn: z.number().optional(),
    }),
  }),
});

// user.dormant_flagged
export const userDormantFlaggedEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.DORMANT_FLAGGED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z.object({
      daysSinceLastSession: z.number(),
      tier: tierSchema.optional(),
    }),
  }),
});

// user.deleted
export const userDeletedLifecycleEventSchema = baseEventSchema.extend({
  type: z.literal(USER_LIFECYCLE_EVENT_TYPES.DELETED),
  data: z.object({
    ...lifecycleBaseFields,
    metadata: z
      .object({
        reason: z.string().optional(),
      })
      .default({}),
  }),
});

// ─── Discriminated Union ───────────────────────────────────────────────────────

export const userLifecycleEventSchema = z.discriminatedUnion('type', [
  userSignedUpEventSchema,
  userOnboardingStepEventSchema,
  userOnboardingCompletedEventSchema,
  userSessionStartedEventSchema,
  userSessionEndedEventSchema,
  userFeatureUsedEventSchema,
  userContentGeneratedEventSchema,
  userTierChangedEventSchema,
  userPaymentSucceededEventSchema,
  userPaymentFailedEventSchema,
  userRefundProcessedEventSchema,
  userTrialStartedEventSchema,
  userTrialConvertedEventSchema,
  userTrialExpiredEventSchema,
  userChurnedEventSchema,
  userReactivatedEventSchema,
  userDormantFlaggedEventSchema,
  userDeletedLifecycleEventSchema,
]);

// ─── Inferred Types ────────────────────────────────────────────────────────────

export type UserSignedUpEvent = z.infer<typeof userSignedUpEventSchema>;
export type UserOnboardingStepEvent = z.infer<typeof userOnboardingStepEventSchema>;
export type UserOnboardingCompletedEvent = z.infer<typeof userOnboardingCompletedEventSchema>;
export type UserSessionStartedEvent = z.infer<typeof userSessionStartedEventSchema>;
export type UserSessionEndedEvent = z.infer<typeof userSessionEndedEventSchema>;
export type UserFeatureUsedEvent = z.infer<typeof userFeatureUsedEventSchema>;
export type UserContentGeneratedEvent = z.infer<typeof userContentGeneratedEventSchema>;
export type UserTierChangedEvent = z.infer<typeof userTierChangedEventSchema>;
export type UserPaymentSucceededEvent = z.infer<typeof userPaymentSucceededEventSchema>;
export type UserPaymentFailedEvent = z.infer<typeof userPaymentFailedEventSchema>;
export type UserRefundProcessedEvent = z.infer<typeof userRefundProcessedEventSchema>;
export type UserTrialStartedEvent = z.infer<typeof userTrialStartedEventSchema>;
export type UserTrialConvertedEvent = z.infer<typeof userTrialConvertedEventSchema>;
export type UserTrialExpiredEvent = z.infer<typeof userTrialExpiredEventSchema>;
export type UserChurnedEvent = z.infer<typeof userChurnedEventSchema>;
export type UserReactivatedEvent = z.infer<typeof userReactivatedEventSchema>;
export type UserDormantFlaggedEvent = z.infer<typeof userDormantFlaggedEventSchema>;
export type UserDeletedLifecycleEvent = z.infer<typeof userDeletedLifecycleEventSchema>;
export type UserLifecycleEvent = z.infer<typeof userLifecycleEventSchema>;

// ─── Factory Function ──────────────────────────────────────────────────────────

export function createUserLifecycleEvent<T extends UserLifecycleEvent['type']>(
  type: T,
  data: Extract<UserLifecycleEvent, { type: T }>['data'],
  source: string = 'user-service',
  options?: { correlationId?: string }
): Extract<UserLifecycleEvent, { type: T }> {
  return {
    eventId: generateEventId('ulc'),
    correlationId: options?.correlationId || generateEventId('cor'),
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source,
    data,
  } as Extract<UserLifecycleEvent, { type: T }>;
}

// ─── Validation ────────────────────────────────────────────────────────────────

export function validateUserLifecycleEvent(event: unknown): UserLifecycleEvent {
  return userLifecycleEventSchema.parse(event);
}

// ─── Lightweight metadata-only schema for REST API ingestion (mobile app) ──────

export const lifecycleEventRequestSchema = z.object({
  eventType: z.string(),
  metadata: z.record(z.unknown()).optional().default({}),
  sessionId: z.string().optional(),
  platform: platformSchema,
});

export const lifecycleEventBatchRequestSchema = z.object({
  events: z
    .array(
      z.object({
        eventType: z.string(),
        metadata: z.record(z.unknown()).optional().default({}),
        sessionId: z.string().optional(),
        platform: platformSchema,
        occurredAt: z.string(),
      })
    )
    .max(100),
});

export type LifecycleEventRequest = z.infer<typeof lifecycleEventRequestSchema>;
export type LifecycleEventBatchRequest = z.infer<typeof lifecycleEventBatchRequestSchema>;
