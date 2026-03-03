/**
 * Use Case: Record a single lifecycle event
 * Persists to aia_user_lifecycle_events with side effects for tier changes and signups.
 */

import { createLogger } from '@aiponge/platform-core';
import type { ILifecycleRepository } from '../../../domains/repositories/ILifecycleRepository';
import type {
  LifecycleEventEntity,
  SubscriptionChangeEntity,
  AcquisitionAttributionEntity,
} from '../../../domains/entities/Lifecycle';
import { USER_LIFECYCLE_EVENT_TYPES } from '@aiponge/shared-contracts';

const logger = createLogger('ai-analytics-service:record-lifecycle-event');

export interface RecordLifecycleEventRequest {
  eventType: string;
  userId: string;
  tier?: string | null;
  platform?: string | null;
  sessionId?: string | null;
  metadata: Record<string, unknown>;
  correlationId: string;
  source: string;
}

export interface RecordLifecycleEventResult {
  eventId: string;
  success: boolean;
}

export class RecordLifecycleEventUseCase {
  constructor(private readonly repository: ILifecycleRepository) {}

  async execute(request: RecordLifecycleEventRequest): Promise<RecordLifecycleEventResult> {
    const event: LifecycleEventEntity = {
      eventType: request.eventType,
      userId: request.userId,
      tier: request.tier,
      platform: request.platform,
      sessionId: request.sessionId,
      metadata: request.metadata,
      correlationId: request.correlationId,
      source: request.source,
    };

    const eventId = await this.repository.insertLifecycleEvent(event);

    // Side effect: tier change → subscription history
    if (request.eventType === USER_LIFECYCLE_EVENT_TYPES.TIER_CHANGED) {
      await this.handleTierChanged(request, eventId);
    }

    // Side effect: signup → acquisition attribution
    if (request.eventType === USER_LIFECYCLE_EVENT_TYPES.SIGNED_UP) {
      await this.handleSignedUp(request);
    }

    return { eventId, success: true };
  }

  private async handleTierChanged(request: RecordLifecycleEventRequest, eventId: string): Promise<void> {
    try {
      const meta = request.metadata;
      const grossAmount = meta.grossAmount != null ? String(meta.grossAmount) : null;
      const netAmount = meta.netAmount != null ? String(meta.netAmount) : this.computeNetAmount(grossAmount);

      const change: SubscriptionChangeEntity = {
        userId: request.userId,
        fromTier: (meta.fromTier as string) ?? null,
        toTier: (meta.toTier as string) ?? 'explorer',
        billingCycle: (meta.billingCycle as string) ?? 'monthly',
        trigger: (meta.trigger as string) ?? 'upgrade',
        grossAmount,
        netAmount,
        store: (meta.store as string) ?? null,
        platform: request.platform,
        trialConverted: false,
        correlationId: request.correlationId,
        effectiveAt: new Date(),
      };

      await this.repository.insertSubscriptionChange(change);
    } catch (err) {
      logger.warn('Failed to insert subscription history for tier change', {
        eventId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async handleSignedUp(request: RecordLifecycleEventRequest): Promise<void> {
    try {
      const meta = request.metadata;
      const attribution: AcquisitionAttributionEntity = {
        userId: request.userId,
        platform: request.platform ?? 'ios',
        store: request.platform === 'android' ? 'google' : 'apple',
        acquisitionSource: (meta.acquisitionSource as string) ?? 'organic',
        campaign: (meta.campaign as string) ?? null,
        referralCode: (meta.referralCode as string) ?? null,
      };

      await this.repository.upsertAcquisitionAttribution(attribution);
    } catch (err) {
      logger.warn('Failed to upsert acquisition attribution for signup', {
        userId: request.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private computeNetAmount(grossAmount: string | null): string | null {
    if (!grossAmount) return null;
    // Apple/Google take 15-30% commission; default to 15% (Small Business Program)
    const net = parseFloat(grossAmount) * 0.85;
    return net.toFixed(2);
  }
}
