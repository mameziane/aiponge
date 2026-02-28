/**
 * Admin Metrics Controller
 * Provides product-wide metrics for admin dashboard
 */

import { Request, Response } from 'express';
import { getDatabase, type DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import { getLogger } from '@config/service-urls';
import { ServiceErrors, sendSuccess } from '../utils/response-helpers';
import { sql } from 'drizzle-orm';
import { TIER_IDS } from '@aiponge/shared-contracts';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('admin-metrics-controller');

export interface UserServiceMetrics {
  activation: {
    onboardingCompletionRate: number | null;
    completedOnboarding: number;
    totalUsers: number;
  };
  engagement: {
    entriesPerUserPerMonth: number | null;
  };
  monetization: {
    freeToPremiumConversionRate: number | null;
    creditPackPurchaseRate: number | null;
    premiumChurn30Day: number | null;
    premiumChurn90Day: number | null;
    totalPremiumUsers: number;
  };
  featureUsage: {
    multipleBooksRate: number | null;
    chaptersUsageRate: number | null;
  };
  summary: {
    totalUsers: number;
    activeUsersLast30Days: number;
    premiumUsers: number;
  };
  generatedAt: string;
}

export class AdminMetricsController {
  async getProductMetrics(req: Request, res: Response): Promise<void> {
    try {
      const db = getDatabase();

      const [activationMetrics, engagementMetrics, monetizationMetrics, featureUsageMetrics, summaryMetrics] =
        await Promise.all([
          this.getActivationMetrics(db),
          this.getEngagementMetrics(db),
          this.getMonetizationMetrics(db),
          this.getFeatureUsageMetrics(db),
          this.getSummaryMetrics(db),
        ]);

      const metrics: UserServiceMetrics = {
        activation: activationMetrics,
        engagement: engagementMetrics,
        monetization: monetizationMetrics,
        featureUsage: featureUsageMetrics,
        summary: summaryMetrics,
        generatedAt: new Date().toISOString(),
      };

      sendSuccess(res, metrics);
    } catch (error) {
      logger.error('Get product metrics error', { error: serializeError(error) });
      ServiceErrors.fromException(res, error, 'Failed to get product metrics', req);
    }
  }

  private async getActivationMetrics(db: DatabaseConnection) {
    try {
      const result = await db.execute(sql`
        SELECT
          COUNT(DISTINCT u.id) as total_users,
          COUNT(DISTINCT CASE WHEN p.onboarding_initialized = true THEN u.id END) as completed_onboarding
        FROM usr_accounts u
        LEFT JOIN usr_profiles p ON u.id = p.user_id
        WHERE u.status = 'active' AND u.is_guest = false
      `);

      const row = (result as unknown as Array<{ total_users: string; completed_onboarding: string }>)[0];
      const totalUsers = parseInt(row?.total_users || '0', 10);
      const completedOnboarding = parseInt(row?.completed_onboarding || '0', 10);

      return {
        onboardingCompletionRate: totalUsers > 0 ? completedOnboarding / totalUsers : null,
        completedOnboarding,
        totalUsers,
      };
    } catch (error) {
      logger.warn('Failed to get activation metrics', { error });
      return { onboardingCompletionRate: null, completedOnboarding: 0, totalUsers: 0 };
    }
  }

  private async getEngagementMetrics(db: DatabaseConnection) {
    try {
      const entriesResult = await db.execute(sql`
          SELECT 
            COALESCE(
              CAST(COUNT(e.id) AS FLOAT) / NULLIF(COUNT(DISTINCT b.user_id), 0),
              0
            ) as entries_per_user
          FROM lib_entries e
          JOIN lib_books b ON e.book_id = b.id
          WHERE e.created_at >= NOW() - INTERVAL '30 days'
        `);

      const entriesRow = (entriesResult as unknown as Array<{ entries_per_user: string }>)[0];

      return {
        entriesPerUserPerMonth: parseFloat(entriesRow?.entries_per_user || '0'),
      };
    } catch (error) {
      logger.warn('Failed to get engagement metrics', { error });
      return {
        entriesPerUserPerMonth: null,
      };
    }
  }

  private async getMonetizationMetrics(db: DatabaseConnection) {
    try {
      const [conversionResult, churnResult, creditResult] = await Promise.all([
        db.execute(sql`
          SELECT
            COUNT(DISTINCT CASE WHEN s.subscription_tier != ${TIER_IDS.GUEST} THEN s.user_id END) as premium_users,
            COUNT(DISTINCT u.id) as total_users
          FROM usr_accounts u
          LEFT JOIN usr_subscriptions s ON u.id = s.user_id
          WHERE u.status = 'active' AND u.is_guest = false
        `),
        db.execute(sql`
          WITH premium_starts AS (
            SELECT 
              user_id,
              MIN(created_at) as started_at
            FROM usr_subscription_events
            WHERE event_type = 'initial_purchase'
            GROUP BY user_id
          ),
          churned AS (
            SELECT 
              ps.user_id,
              ps.started_at,
              se.created_at as churned_at
            FROM premium_starts ps
            JOIN usr_subscription_events se ON ps.user_id = se.user_id
            WHERE se.event_type IN ('cancellation', 'expiration')
          )
          SELECT 
            COUNT(CASE WHEN churned.churned_at - churned.started_at <= INTERVAL '30 days' THEN 1 END) as churn_30d,
            COUNT(CASE WHEN churned.churned_at - churned.started_at <= INTERVAL '90 days' THEN 1 END) as churn_90d,
            (SELECT COUNT(*) FROM premium_starts) as total_premium_starts
          FROM churned
        `),
        db.execute(sql`
          SELECT 
            COUNT(DISTINCT user_id) as users_with_purchases
          FROM usr_credit_orders
          WHERE status = 'completed'
        `),
      ]);

      const convRow = (conversionResult as unknown as Array<{ premium_users: string; total_users: string }>)[0];
      const churnRow = (
        churnResult as unknown as Array<{ churn_30d: string; churn_90d: string; total_premium_starts: string }>
      )[0];
      const creditRow = (creditResult as unknown as Array<{ users_with_purchases: string }>)[0];

      const premiumUsers = parseInt(convRow?.premium_users || '0', 10);
      const totalUsers = parseInt(convRow?.total_users || '0', 10);
      const totalPremiumStarts = parseInt(churnRow?.total_premium_starts || '0', 10);
      const churn30d = parseInt(churnRow?.churn_30d || '0', 10);
      const churn90d = parseInt(churnRow?.churn_90d || '0', 10);
      const usersWithPurchases = parseInt(creditRow?.users_with_purchases || '0', 10);

      return {
        freeToPremiumConversionRate: totalUsers > 0 ? premiumUsers / totalUsers : null,
        creditPackPurchaseRate: premiumUsers > 0 ? usersWithPurchases / premiumUsers : null,
        premiumChurn30Day: totalPremiumStarts > 0 ? churn30d / totalPremiumStarts : null,
        premiumChurn90Day: totalPremiumStarts > 0 ? churn90d / totalPremiumStarts : null,
        totalPremiumUsers: premiumUsers,
      };
    } catch (error) {
      logger.warn('Failed to get monetization metrics', { error });
      return {
        freeToPremiumConversionRate: null,
        creditPackPurchaseRate: null,
        premiumChurn30Day: null,
        premiumChurn90Day: null,
        totalPremiumUsers: 0,
      };
    }
  }

  private async getFeatureUsageMetrics(db: DatabaseConnection) {
    try {
      const [booksResult, chaptersResult] = await Promise.all([
        db.execute(sql`
          SELECT 
            COUNT(DISTINCT CASE WHEN book_count >= 2 THEN user_id END) as multi_book_users,
            COUNT(DISTINCT user_id) as total_book_users
          FROM (
            SELECT user_id, COUNT(*) as book_count
            FROM lib_books
            GROUP BY user_id
          ) b
        `),
        db.execute(sql`
          SELECT 
            COUNT(DISTINCT b.user_id) as users_with_chapters,
            (SELECT COUNT(DISTINCT id) FROM usr_accounts WHERE status = 'active' AND is_guest = false) as total_users
          FROM lib_chapters c
          JOIN lib_books b ON c.book_id = b.id
        `),
      ]);

      const booksRow = (booksResult as unknown as Array<{ multi_book_users: string; total_book_users: string }>)[0];
      const chaptersRow = (chaptersResult as unknown as Array<{ users_with_chapters: string; total_users: string }>)[0];

      const multiBookUsers = parseInt(booksRow?.multi_book_users || '0', 10);
      const totalBookUsers = parseInt(booksRow?.total_book_users || '0', 10);
      const usersWithChapters = parseInt(chaptersRow?.users_with_chapters || '0', 10);
      const totalUsersChapters = parseInt(chaptersRow?.total_users || '0', 10);

      return {
        multipleBooksRate: totalBookUsers > 0 ? multiBookUsers / totalBookUsers : null,
        chaptersUsageRate: totalUsersChapters > 0 ? usersWithChapters / totalUsersChapters : null,
      };
    } catch (error) {
      logger.warn('Failed to get feature usage metrics', { error });
      return {
        multipleBooksRate: null,
        chaptersUsageRate: null,
      };
    }
  }

  private async getSummaryMetrics(db: DatabaseConnection) {
    try {
      const result = await db.execute(sql`
        SELECT
          COUNT(DISTINCT u.id) as total_users,
          COUNT(DISTINCT CASE WHEN u.last_login_at >= NOW() - INTERVAL '30 days' THEN u.id END) as active_30d,
          COUNT(DISTINCT CASE WHEN s.subscription_tier != ${TIER_IDS.GUEST} THEN u.id END) as premium_users
        FROM usr_accounts u
        LEFT JOIN usr_subscriptions s ON u.id = s.user_id
        WHERE u.status = 'active' AND u.is_guest = false
      `);

      const row = (result as unknown as Array<{ total_users: string; active_30d: string; premium_users: string }>)[0];

      return {
        totalUsers: parseInt(row?.total_users || '0', 10),
        activeUsersLast30Days: parseInt(row?.active_30d || '0', 10),
        premiumUsers: parseInt(row?.premium_users || '0', 10),
      };
    } catch (error) {
      logger.warn('Failed to get summary metrics', { error });
      return { totalUsers: 0, activeUsersLast30Days: 0, premiumUsers: 0 };
    }
  }
}
