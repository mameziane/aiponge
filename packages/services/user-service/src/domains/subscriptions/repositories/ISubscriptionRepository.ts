/**
 * Subscription Repository Interface
 * Handles subscription management, usage tracking, and entitlement checking
 */

import {
  Subscription,
  UsageLimits,
  SubscriptionEvent,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
  UsageCheckResult,
} from '../entities';

export interface RevenueCatWebhookEvent {
  type: string;
  app_user_id: string;
  product_id?: string;
  entitlement_ids?: string[];
  period_type?: string;
  expiration_at_ms?: number;
  store?: string;
  cancel_at_period_end?: boolean;
  trial_end_at_ms?: number;
}

export interface RevenueCatWebhookData {
  type: string;
  event: RevenueCatWebhookEvent;
}

export interface ISubscriptionRepository {
  // Subscription Management
  createSubscription(request: CreateSubscriptionRequest): Promise<Subscription>;
  getSubscriptionByUserId(userId: string): Promise<Subscription | null>;
  getSubscriptionByRevenueCatId(revenueCatCustomerId: string): Promise<Subscription | null>;
  updateSubscription(subscriptionId: string, updates: UpdateSubscriptionRequest): Promise<Subscription>;
  initializeUserSubscription(userId: string): Promise<Subscription>;

  // Usage Limits
  getCurrentUsage(userId: string): Promise<UsageLimits | null>;
  incrementUsage(userId: string, type: 'songs' | 'lyrics' | 'insights'): Promise<UsageLimits>;
  checkUsageLimit(userId: string, type: 'songs' | 'lyrics' | 'insights'): Promise<UsageCheckResult>;
  resetMonthlyUsage(userId: string): Promise<UsageLimits>;

  // Entitlement Checking
  hasEntitlement(userId: string, entitlement: string): Promise<boolean>;
  getSubscriptionTier(userId: string): Promise<string>;

  // Events
  createSubscriptionEvent(event: Omit<SubscriptionEvent, 'id' | 'createdAt'>): Promise<SubscriptionEvent>;
  getSubscriptionEvents(subscriptionId: string, limit?: number): Promise<SubscriptionEvent[]>;

  // RevenueCat Webhook Processing
  processWebhook(webhookData: RevenueCatWebhookData): Promise<void>;
}
