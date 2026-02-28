/**
 * Subscription Repository Implementation
 * Handles subscription management, usage tracking, and RevenueCat webhook processing
 */

import { eq, and, sql, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import {
  ISubscriptionRepository,
  RevenueCatWebhookData,
} from '../../domains/subscriptions/repositories/ISubscriptionRepository';
import {
  Subscription,
  UsageLimits,
  SubscriptionEvent,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  UsageCheckResult,
} from '../../domains/subscriptions/entities';
import {
  usrSubscriptions,
  usrUsageLimits,
  usrSubscriptionEvents,
  SUBSCRIPTION_TIERS,
  TIER_IDS,
  isPaidTier,
  normalizeTier,
} from '../database/schemas/subscription-schema';
import { users } from '../database/schemas/user-schema';
import { getLogger } from '../../config/service-urls';
import { BillingError } from '../../application/errors/errors';
import { SUBSCRIPTION_STATUS, isAdmin } from '@aiponge/shared-contracts';

const logger = getLogger('subscription-repository');

export class SubscriptionRepository implements ISubscriptionRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async createSubscription(request: CreateSubscriptionRequest): Promise<Subscription> {
    const [subscription] = await this.db
      .insert(usrSubscriptions)
      .values({
        userId: request.userId,
        revenueCatCustomerId: request.revenueCatCustomerId || null,
        subscriptionTier: request.subscriptionTier || TIER_IDS.GUEST,
        status: SUBSCRIPTION_STATUS.ACTIVE,
        platform: request.platform || null,
        productId: request.productId || null,
        entitlementId: request.entitlementId || null,
      })
      .returning();

    logger.info('Subscription created', { userId: request.userId, tier: subscription.subscriptionTier });

    // Create initial event
    await this.createSubscriptionEvent({
      subscriptionId: subscription.id,
      userId: request.userId,
      eventType: 'initial_purchase',
      eventSource: 'system',
      previousTier: null,
      newTier: subscription.subscriptionTier,
      previousStatus: null,
      newStatus: SUBSCRIPTION_STATUS.ACTIVE,
      eventData: {},
    });

    return subscription as Subscription;
  }

  async getSubscriptionByUserId(userId: string): Promise<Subscription | null> {
    const [subscription] = await this.db
      .select()
      .from(usrSubscriptions)
      .where(and(eq(usrSubscriptions.userId, userId), isNull(usrSubscriptions.deletedAt)));

    return (subscription as Subscription) || null;
  }

  async getSubscriptionByRevenueCatId(revenueCatCustomerId: string): Promise<Subscription | null> {
    const [subscription] = await this.db
      .select()
      .from(usrSubscriptions)
      .where(and(eq(usrSubscriptions.revenueCatCustomerId, revenueCatCustomerId), isNull(usrSubscriptions.deletedAt)));

    return (subscription as Subscription) || null;
  }

  async updateSubscription(subscriptionId: string, updates: UpdateSubscriptionRequest): Promise<Subscription> {
    const [subscription] = await this.db
      .update(usrSubscriptions)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(usrSubscriptions.id, subscriptionId), isNull(usrSubscriptions.deletedAt)))
      .returning();

    logger.info('Subscription updated', { subscriptionId, updates });
    return subscription as Subscription;
  }

  async getCurrentUsage(userId: string): Promise<UsageLimits | null> {
    const currentMonth = this.getCurrentMonth();

    const [usage] = await this.db
      .select()
      .from(usrUsageLimits)
      .where(
        and(eq(usrUsageLimits.userId, userId), eq(usrUsageLimits.month, currentMonth), isNull(usrUsageLimits.deletedAt))
      );

    if (!usage) {
      // Create initial usage record for the month
      const resetAt = this.getMonthEndDate();
      const [newUsage] = await this.db
        .insert(usrUsageLimits)
        .values({
          userId,
          month: currentMonth,
          songsGenerated: 0,
          lyricsGenerated: 0,
          insightsGenerated: 0,
          resetAt,
        })
        .returning();

      return newUsage as UsageLimits;
    }

    return usage as UsageLimits;
  }

  async incrementUsage(userId: string, type: 'songs' | 'lyrics' | 'insights'): Promise<UsageLimits> {
    const currentMonth = this.getCurrentMonth();
    const usage = await this.getCurrentUsage(userId);

    if (!usage) {
      throw BillingError.notFound('Usage record', userId);
    }

    const updateField =
      type === 'songs' ? 'songsGenerated' : type === 'lyrics' ? 'lyricsGenerated' : 'insightsGenerated';

    const [updated] = await this.db
      .update(usrUsageLimits)
      .set({
        [updateField]: sql`${usrUsageLimits[updateField]} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(usrUsageLimits.userId, userId), eq(usrUsageLimits.month, currentMonth), isNull(usrUsageLimits.deletedAt))
      )
      .returning();

    logger.info('Usage incremented', { userId, type, currentUsage: updated[updateField] });
    return updated as UsageLimits;
  }

  async checkUsageLimit(userId: string, type: 'songs' | 'lyrics' | 'insights'): Promise<UsageCheckResult> {
    const [userRecord] = await this.db
      .select({ role: users.role })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (userRecord && isAdmin(userRecord.role)) {
      logger.info('Admin role bypass: granting unlimited usage', { userId, type, role: userRecord.role });
      return { allowed: true, tier: TIER_IDS.STUDIO };
    }

    let subscription = await this.getSubscriptionByUserId(userId);

    if (!subscription) {
      logger.warn('Subscription not found, auto-initializing guest tier', { userId });
      subscription = await this.initializeUserSubscription(userId);
    }

    // Normalize tier value before comparison
    const rawTier = subscription.subscriptionTier || TIER_IDS.GUEST;
    let tier = normalizeTier(rawTier) as keyof typeof SUBSCRIPTION_TIERS;

    // Ensure tier exists in config, default to guest if not found
    if (!(tier in SUBSCRIPTION_TIERS)) {
      tier = TIER_IDS.GUEST as keyof typeof SUBSCRIPTION_TIERS;
    }

    const tierConfig = SUBSCRIPTION_TIERS[tier];
    const limits = tierConfig.limits;

    // Check if this tier allows music generation at all (guest users cannot)
    if (type === 'songs' && 'features' in tierConfig && tierConfig.features && !tierConfig.features.canGenerateMusic) {
      return {
        allowed: false,
        remaining: 0,
        limit: 0,
        tier: tier,
        reason: 'Subscription required to generate music. Please subscribe to a paid plan.',
      };
    }

    const limitField = type === 'songs' ? 'songsPerMonth' : type === 'lyrics' ? 'lyricsPerMonth' : 'insightsPerMonth';

    const limit = limits[limitField];

    // Unlimited for paid tier insights
    if (limit === -1) {
      return { allowed: true, tier: tier }; // Unlimited
    }

    // Safety check: zero or negative limit (except -1) means feature is not available
    if ((limit as number) <= 0) {
      return {
        allowed: false,
        remaining: 0,
        limit: 0,
        tier: tier,
        reason: `${type} generation requires a subscription`,
      };
    }

    const usage = await this.getCurrentUsage(userId);
    if (!usage) {
      return { allowed: false, reason: 'Usage tracking not initialized', tier: tier };
    }

    const usageField =
      type === 'songs' ? usage.songsGenerated : type === 'lyrics' ? usage.lyricsGenerated : usage.insightsGenerated;

    const remaining = Math.max(0, limit - usageField);
    const allowed = usageField < limit;

    return {
      allowed,
      remaining,
      limit,
      tier: tier,
      resetAt: usage.resetAt,
      reason: allowed ? undefined : `Monthly ${type} limit reached. Upgrade to a paid plan for more.`,
    };
  }

  async resetMonthlyUsage(userId: string): Promise<UsageLimits> {
    const currentMonth = this.getCurrentMonth();
    const resetAt = this.getMonthEndDate();

    const [usage] = await this.db
      .insert(usrUsageLimits)
      .values({
        userId,
        month: currentMonth,
        songsGenerated: 0,
        lyricsGenerated: 0,
        insightsGenerated: 0,
        resetAt,
      })
      .onConflictDoUpdate({
        target: [usrUsageLimits.userId, usrUsageLimits.month],
        set: {
          songsGenerated: 0,
          lyricsGenerated: 0,
          insightsGenerated: 0,
          resetAt,
          updatedAt: new Date(),
        },
      })
      .returning();

    logger.info('Monthly usage reset', { userId, month: currentMonth });
    return usage as UsageLimits;
  }

  async hasEntitlement(userId: string, entitlement: string): Promise<boolean> {
    const subscription = await this.getSubscriptionByUserId(userId);

    if (!subscription || subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
      return false;
    }

    // Check if entitlement matches (case-insensitive)
    if (subscription.entitlementId?.toLowerCase() === entitlement.toLowerCase()) {
      return true;
    }

    const normalizedTier = normalizeTier(subscription.subscriptionTier);
    if (
      ([TIER_IDS.PERSONAL, TIER_IDS.PRACTICE, TIER_IDS.STUDIO] as string[]).includes(entitlement.toLowerCase()) &&
      isPaidTier(normalizedTier)
    ) {
      return true;
    }

    return false;
  }

  async getSubscriptionTier(userId: string): Promise<string> {
    const subscription = await this.getSubscriptionByUserId(userId);

    if (!subscription || subscription.status !== SUBSCRIPTION_STATUS.ACTIVE) {
      return TIER_IDS.GUEST;
    }

    return subscription.subscriptionTier;
  }

  async createSubscriptionEvent(event: Omit<SubscriptionEvent, 'id' | 'createdAt'>): Promise<SubscriptionEvent> {
    const [subscriptionEvent] = await this.db.insert(usrSubscriptionEvents).values(event).returning();

    logger.info('Subscription event created', { eventType: event.eventType, userId: event.userId });
    return subscriptionEvent as SubscriptionEvent;
  }

  async getSubscriptionEvents(subscriptionId: string, limit: number = 50): Promise<SubscriptionEvent[]> {
    const events = await this.db
      .select()
      .from(usrSubscriptionEvents)
      .where(eq(usrSubscriptionEvents.subscriptionId, subscriptionId))
      .orderBy(sql`${usrSubscriptionEvents.createdAt} DESC`)
      .limit(Math.min(limit || 20, 100));

    return events as SubscriptionEvent[];
  }

  async processWebhook(webhookData: RevenueCatWebhookData): Promise<void> {
    logger.info('Processing RevenueCat webhook', { eventType: webhookData.type });

    const { type, app_user_id, product_id, entitlement_ids, period_type, expiration_at_ms, store } = webhookData.event;

    // Find or create subscription by RevenueCat customer ID
    let subscription = await this.getSubscriptionByRevenueCatId(app_user_id);

    if (!subscription) {
      // Try to find by userId (app_user_id might be our userId)
      subscription = await this.getSubscriptionByUserId(app_user_id);

      if (!subscription) {
        logger.warn('Subscription not found for webhook', { app_user_id });
        return;
      }
    }

    const previousTier = subscription.subscriptionTier;
    const previousStatus = subscription.status;

    // Determine new tier and status based on webhook type
    let newTier: string = previousTier;
    let newStatus: (typeof SUBSCRIPTION_STATUS)[keyof typeof SUBSCRIPTION_STATUS] = previousStatus;
    const eventType = type;

    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
        newStatus = SUBSCRIPTION_STATUS.ACTIVE;
        newTier = this.determineTierFromProduct(product_id, entitlement_ids);
        break;

      case 'CANCELLATION':
        newStatus = SUBSCRIPTION_STATUS.CANCELLED;
        break;

      case 'EXPIRATION':
        newStatus = SUBSCRIPTION_STATUS.EXPIRED;
        newTier = TIER_IDS.GUEST;
        break;

      case 'BILLING_ISSUE':
        newStatus = SUBSCRIPTION_STATUS.PAST_DUE;
        break;
    }

    // Extract additional fields from webhook
    const { cancel_at_period_end, trial_end_at_ms } = webhookData.event;

    // Update subscription with all relevant fields - normalize tier before persisting
    const normalizedNewTier = normalizeTier(newTier);
    await this.updateSubscription(subscription.id, {
      subscriptionTier: normalizedNewTier,
      status: newStatus,
      productId: product_id,
      entitlementId: entitlement_ids?.[0] || null,
      currentPeriodEnd: expiration_at_ms ? new Date(expiration_at_ms) : null,
      cancelAtPeriodEnd: cancel_at_period_end === true || type === 'CANCELLATION',
      trialEnd: trial_end_at_ms ? new Date(trial_end_at_ms) : null,
      billingIssue: type === 'BILLING_ISSUE',
      metadata: {
        ...subscription.metadata,
        lastWebhook: webhookData,
      },
    });

    // Create event
    await this.createSubscriptionEvent({
      subscriptionId: subscription.id,
      userId: subscription.userId,
      eventType,
      eventSource: 'revenuecat',
      previousTier,
      newTier,
      previousStatus,
      newStatus,
      eventData: webhookData as unknown as Record<string, unknown>,
    });

    logger.info('Webhook processed successfully', {
      subscriptionId: subscription.id,
      eventType,
      previousTier,
      newTier,
    });
  }

  /**
   * Initialize explorer tier subscription for new users
   * Creates subscription record + initial usage tracking
   */
  async initializeUserSubscription(userId: string): Promise<Subscription> {
    logger.info('Initializing explorer tier subscription', { userId });

    const existingSubscription = await this.getSubscriptionByUserId(userId);
    if (existingSubscription) {
      logger.warn('Subscription already exists, skipping initialization', { userId });
      return existingSubscription;
    }

    const subscription = await this.createSubscription({
      userId,
      subscriptionTier: TIER_IDS.GUEST,
    });

    await this.getCurrentUsage(userId);

    logger.info('User subscription initialized successfully', { userId, subscriptionId: subscription.id });
    return subscription;
  }

  // Helper methods
  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private getMonthEndDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, -1);
  }

  private determineTierFromProduct(productId: string, entitlementIds?: string[]): string {
    if (entitlementIds?.includes(TIER_IDS.STUDIO)) {
      return TIER_IDS.STUDIO;
    }
    if (entitlementIds?.includes(TIER_IDS.PRACTICE)) {
      return TIER_IDS.PRACTICE;
    }
    if (entitlementIds?.includes(TIER_IDS.PERSONAL)) {
      return TIER_IDS.PERSONAL;
    }

    const lowerProductId = productId?.toLowerCase() || '';
    if (lowerProductId.includes(TIER_IDS.STUDIO)) {
      return TIER_IDS.STUDIO;
    }
    if (lowerProductId.includes(TIER_IDS.PRACTICE)) {
      return TIER_IDS.PRACTICE;
    }
    if (lowerProductId.includes(TIER_IDS.PERSONAL)) {
      return TIER_IDS.PERSONAL;
    }

    return TIER_IDS.GUEST;
  }
}
