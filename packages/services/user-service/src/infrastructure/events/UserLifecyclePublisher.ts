/**
 * User Lifecycle Event Publisher
 * Publishes lifecycle events for ai-analytics-service consumption.
 * Fire-and-forget with retry logic — never blocks the calling code path.
 */

import {
  createEventBusClient,
  type IStandardizedEventBusClient,
  type StandardEvent,
  getServiceName,
  generateCorrelationId,
} from '@aiponge/platform-core';
import { USER_LIFECYCLE_EVENT_TYPES } from '@aiponge/shared-contracts';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('user-lifecycle-publisher');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

let eventBusClient: IStandardizedEventBusClient | null = null;

function getEventBusClient(): IStandardizedEventBusClient {
  if (!eventBusClient) {
    eventBusClient = createEventBusClient(getServiceName('user-service'));
  }
  return eventBusClient;
}

function buildEvent(type: string, data: Record<string, unknown>, correlationId: string): StandardEvent {
  return {
    eventId: `ulc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    correlationId,
    type,
    timestamp: new Date().toISOString(),
    version: '1.0',
    source: 'user-service',
    data,
  };
}

async function publishWithRetry(event: StandardEvent): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await getEventBusClient().publish(event);
      logger.debug('Published lifecycle event: {}', { data0: event.type, eventId: event.eventId });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES) {
        logger.debug('Retrying lifecycle event publish (attempt {}/{}): {}', {
          data0: attempt,
          data1: MAX_RETRIES,
          data2: event.type,
        });
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
      }
    }
  }
  logger.warn('Failed to publish lifecycle event after {} attempts (non-blocking): {}', {
    data0: MAX_RETRIES,
    data1: event.type,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

function safePublish(event: StandardEvent): void {
  publishWithRetry(event).catch((error: unknown) => {
    logger.warn('Unexpected error in lifecycle publisher (non-blocking): {}', {
      data0: event.type,
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

export const UserLifecyclePublisher = {
  userSignedUp(
    userId: string,
    options?: { platform?: string; acquisitionSource?: string; campaign?: string; referralCode?: string },
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      buildEvent(
        USER_LIFECYCLE_EVENT_TYPES.SIGNED_UP,
        {
          userId,
          platform: options?.platform ?? null,
          metadata: {
            acquisitionSource: options?.acquisitionSource,
            campaign: options?.campaign,
            referralCode: options?.referralCode,
          },
        },
        correlationId
      )
    );
  },

  tierChanged(
    userId: string,
    fromTier: string | null,
    toTier: string,
    options?: {
      billingCycle?: string;
      trigger?: string;
      grossAmount?: number;
      netAmount?: number;
      store?: string;
      platform?: string;
      transactionId?: string;
    },
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      buildEvent(
        USER_LIFECYCLE_EVENT_TYPES.TIER_CHANGED,
        {
          userId,
          platform: options?.platform ?? null,
          metadata: {
            fromTier,
            toTier,
            billingCycle: options?.billingCycle,
            trigger: options?.trigger ?? 'upgrade',
            grossAmount: options?.grossAmount,
            netAmount: options?.netAmount,
            store: options?.store,
            transactionId: options?.transactionId,
          },
        },
        correlationId
      )
    );
  },

  paymentSucceeded(
    userId: string,
    options: {
      transactionId: string;
      grossAmount: number;
      currency: string;
      store: string;
      billingCycle: string;
      tier: string;
      platform?: string;
    },
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      buildEvent(
        USER_LIFECYCLE_EVENT_TYPES.PAYMENT_SUCCEEDED,
        {
          userId,
          platform: options.platform ?? null,
          metadata: {
            transactionId: options.transactionId,
            grossAmount: options.grossAmount,
            currency: options.currency,
            store: options.store,
            billingCycle: options.billingCycle,
            tier: options.tier,
          },
        },
        correlationId
      )
    );
  },

  paymentFailed(
    userId: string,
    options: { reason: string; transactionId?: string; retryCount?: number; store?: string; platform?: string },
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      buildEvent(
        USER_LIFECYCLE_EVENT_TYPES.PAYMENT_FAILED,
        {
          userId,
          platform: options.platform ?? null,
          metadata: {
            reason: options.reason,
            transactionId: options.transactionId,
            retryCount: options.retryCount,
            store: options.store,
          },
        },
        correlationId
      )
    );
  },

  refundProcessed(
    userId: string,
    options: { transactionId: string; amount: number; reason?: string; platform?: string },
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      buildEvent(
        USER_LIFECYCLE_EVENT_TYPES.REFUND_PROCESSED,
        {
          userId,
          platform: options.platform ?? null,
          metadata: {
            transactionId: options.transactionId,
            amount: options.amount,
            reason: options.reason,
          },
        },
        correlationId
      )
    );
  },

  churned(
    userId: string,
    options: { tier: string; reason: string; tenureMonths?: number; platform?: string },
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      buildEvent(
        USER_LIFECYCLE_EVENT_TYPES.CHURNED,
        {
          userId,
          platform: options.platform ?? null,
          metadata: {
            tier: options.tier,
            reason: options.reason,
            tenureMonths: options.tenureMonths,
          },
        },
        correlationId
      )
    );
  },

  reactivated(
    userId: string,
    options: { previousTier: string; newTier: string; daysSinceChurn?: number; platform?: string },
    correlationId: string = generateCorrelationId()
  ): void {
    safePublish(
      buildEvent(
        USER_LIFECYCLE_EVENT_TYPES.REACTIVATED,
        {
          userId,
          platform: options.platform ?? null,
          metadata: {
            previousTier: options.previousTier,
            newTier: options.newTier,
            daysSinceChurn: options.daysSinceChurn,
          },
        },
        correlationId
      )
    );
  },

  userDeleted(userId: string, correlationId: string = generateCorrelationId()): void {
    safePublish(buildEvent(USER_LIFECYCLE_EVENT_TYPES.DELETED, { userId, metadata: {} }, correlationId));
  },
};
