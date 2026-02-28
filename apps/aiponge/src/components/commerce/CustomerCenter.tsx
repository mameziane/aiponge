/**
 * RevenueCat Customer Center Helper
 * Allows users to manage their subscriptions
 * Docs: https://www.revenuecat.com/docs/tools/customer-center
 */

import RevenueCatUI from 'react-native-purchases-ui';
import { logger } from '../../lib/logger';

/**
 * Present the Customer Center modal
 * This shows users their subscription status and management options
 */
export async function presentCustomerCenter(): Promise<void> {
  try {
    logger.debug('Customer Center presenting...');

    interface CustomerInfo {
      entitlements: {
        active: Record<string, unknown>;
      };
    }

    await RevenueCatUI.presentCustomerCenter({
      callbacks: {
        onFeedbackSurveyCompleted: function ({ feedbackSurveyOptionId }: { feedbackSurveyOptionId: string }) {
          logger.debug('Customer Center survey completed', { feedbackSurveyOptionId });
        },
        onShowingManageSubscriptions: function () {
          logger.debug('Customer Center manage subscriptions displayed');
        },
        onRestoreStarted: function () {
          logger.debug('Customer Center restore started');
        },
        onRestoreCompleted: function ({ customerInfo }: { customerInfo: CustomerInfo }) {
          logger.info('Customer Center restore completed', {
            hasEntitlement: customerInfo.entitlements.active['aiponge Pro'] !== undefined,
          });
        },
        onRestoreFailed: function ({ error }: { error: unknown }) {
          logger.error('Customer Center restore failed', error);
        },
        onRefundRequestStarted: function ({ productIdentifier }: { productIdentifier: string }) {
          logger.debug('Customer Center refund started', { productIdentifier });
        },
        onRefundRequestCompleted: function ({
          productIdentifier,
          refundRequestStatus,
        }: {
          productIdentifier: string;
          refundRequestStatus: unknown;
        }) {
          logger.debug('Customer Center refund completed', { productIdentifier, refundRequestStatus });
        },
        onManagementOptionSelected: function (params: { option: string }) {
          logger.debug('Customer Center management option selected', { params });
        },
      },
    });
  } catch (error) {
    logger.error('Customer Center error presenting', error);
    throw error;
  }
}
