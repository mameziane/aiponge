/**
 * Subscription Domain Entities
 */

import type { SubscriptionTier } from '@aiponge/shared-contracts';

export type SubscriptionTierType = SubscriptionTier;

export interface Subscription {
  id: string;
  userId: string;
  revenueCatCustomerId: string | null;
  subscriptionTier: SubscriptionTierType;
  status: 'active' | 'cancelled' | 'expired' | 'past_due';
  platform: string | null;
  productId: string | null;
  entitlementId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: Date | null;
  billingIssue: boolean;
  lastSyncedAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageLimits {
  id: string;
  userId: string;
  month: string; // YYYY-MM format
  songsGenerated: number;
  lyricsGenerated: number;
  insightsGenerated: number;
  resetAt: Date;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubscriptionEvent {
  id: string;
  subscriptionId: string;
  userId: string;
  eventType: string;
  eventSource: 'revenuecat' | 'manual' | 'system';
  previousTier: string | null;
  newTier: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  eventData: Record<string, unknown>;
  createdAt: Date;
}

export interface SubscriptionTierLimits {
  songsPerMonth: number; // -1 = unlimited
  lyricsPerMonth: number;
  insightsPerMonth: number;
}

export interface CreateSubscriptionRequest {
  userId: string;
  revenueCatCustomerId?: string;
  subscriptionTier?: SubscriptionTierType;
  platform?: string;
  productId?: string;
  entitlementId?: string;
}

export interface UpdateSubscriptionRequest {
  subscriptionTier?: SubscriptionTierType;
  status?: 'active' | 'cancelled' | 'expired' | 'past_due';
  platform?: string;
  productId?: string;
  entitlementId?: string;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  trialEnd?: Date | null;
  billingIssue?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UsageCheckResult {
  allowed: boolean;
  remaining?: number;
  limit?: number;
  resetAt?: Date;
  reason?: string;
  tier?: string; // Current subscription tier for frontend display
}
