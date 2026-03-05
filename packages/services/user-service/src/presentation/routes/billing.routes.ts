import { Router, Request, Response } from 'express';
import { serviceAuthMiddleware } from '@aiponge/platform-core';
import type { CreditController } from '../controllers/CreditController';
import type { SubscriptionController } from '../controllers/SubscriptionController';
import {
  validateReserveCredits,
  validateSettleReservation,
  validateCancelReservation,
  validateDeductCredits,
  validateRefundCredits,
  validateValidateCredits,
  validateGrantRevenueCat,
  validateFulfillOrder,
  validateCreatePendingOrder,
  validateSendGift,
  validateClaimGift,
  validateCheckUsageLimit,
  validateIncrementUsage,
  validateCheckEligibility,
  validateCheckQuota,
  validateUpdatePendingOrderTransaction,
  validateUpdatePendingOrderStatus,
} from '../middleware/billing-validation';

export interface BillingRouteDeps {
  creditController: CreditController;
  subscriptionController: SubscriptionController;
}

export function registerBillingRoutes(router: Router, deps: BillingRouteDeps): void {
  const { creditController, subscriptionController } = deps;

  // ==============================================
  // CREDIT ROUTES
  // ==============================================

  router.get('/credits/policy', (req, res) => creditController.getCreditPolicy(req, res));
  router.get('/credits/:userId/balance', (req, res) => creditController.getBalance(req, res));
  router.post('/credits/:userId/validate', validateValidateCredits, (req, res) =>
    creditController.validateCredits(req, res)
  );
  router.post('/credits/:userId/deduct', validateDeductCredits, (req, res) => creditController.deductCredits(req, res));
  router.post('/credits/:userId/refund', validateRefundCredits, (req, res) => creditController.refundCredits(req, res));
  router.get('/credits/:userId/transactions', (req, res) => creditController.getTransactionHistory(req, res));

  // Credit Reservation (reserve-settle-cancel pattern for atomic operations)
  router.post('/credits/:userId/reserve', validateReserveCredits, (req, res) =>
    creditController.reserveCredits(req, res)
  );
  router.post('/credits/reservations/:reservationId/settle', validateSettleReservation, (req, res) =>
    creditController.settleReservation(req, res)
  );
  router.post('/credits/reservations/:reservationId/cancel', validateCancelReservation, (req, res) =>
    creditController.cancelReservation(req, res)
  );

  // Credit Store - Order and Gift fulfillment
  router.post('/credits/fulfill', validateFulfillOrder, (req, res) => creditController.fulfillOrder(req, res));
  router.post('/credits/gift/send', validateSendGift, (req, res) => creditController.sendGift(req, res));
  router.post('/credits/gift/claim', validateClaimGift, (req, res) => creditController.claimGift(req, res));
  router.post('/credits/grant-revenuecat', validateGrantRevenueCat, (req, res) =>
    creditController.grantRevenueCatCredits(req, res)
  );
  router.get('/credits/:userId/orders', (req, res) => creditController.getOrders(req, res));
  router.get('/credits/:userId/gifts/sent', (req, res) => creditController.getSentGifts(req, res));
  router.get('/credits/:userId/gifts/received', (req, res) => creditController.getReceivedGifts(req, res));
  router.get('/credits/:userId/gifts/pending', (req, res) => creditController.getPendingGifts(req, res));
  router.post('/credits/orders/pending', validateCreatePendingOrder, (req, res) =>
    creditController.createPendingOrder(req, res)
  );
  router.patch('/credits/orders/:orderId/transaction', validateUpdatePendingOrderTransaction, (req, res) =>
    creditController.updatePendingOrderTransaction(req, res)
  );
  router.patch('/credits/orders/:orderId/status', validateUpdatePendingOrderStatus, (req, res) =>
    creditController.updatePendingOrderStatus(req, res)
  );

  // Admin - Platform credit statistics
  router.get('/admin/credits/stats', serviceAuthMiddleware({ required: true }), (req, res) =>
    creditController.getCreditsStats(req, res)
  );

  // ==============================================
  // SUBSCRIPTION ROUTES (9 endpoints)
  // ==============================================

  // Config endpoint (public, no auth required) - must be before :userId routes
  router.get('/subscriptions/config', (req, res) => subscriptionController.getConfig(req, res));

  router.get('/subscriptions/:userId', (req, res) => subscriptionController.getSubscriptionStatus(req, res));
  router.post('/subscriptions/:userId', (req, res) => subscriptionController.createSubscription(req, res));
  router.get('/subscriptions/:userId/usage', (req, res) => subscriptionController.getUsageLimits(req, res));
  router.post('/subscriptions/:userId/check-limit', validateCheckUsageLimit, (req, res) =>
    subscriptionController.checkUsageLimit(req, res)
  );
  router.post('/subscriptions/:userId/increment-usage', validateIncrementUsage, (req, res) =>
    subscriptionController.incrementUsage(req, res)
  );
  router.get('/subscriptions/:userId/entitlements/:entitlement', (req, res) =>
    subscriptionController.checkEntitlement(req, res)
  );
  router.get('/subscriptions/:userId/events', (req, res) => subscriptionController.getSubscriptionEvents(req, res));
  router.post('/subscriptions/webhook/revenuecat', (req, res) =>
    subscriptionController.processRevenueCatWebhook(req, res)
  );

  // Check usage eligibility (server-side feature gating)
  router.post('/subscriptions/:userId/check-eligibility', validateCheckEligibility, (req, res) =>
    subscriptionController.checkUsageEligibility(req, res)
  );

  // Unified quota check (subscription limits + credits in one call)
  router.post('/quota/:userId/check', validateCheckQuota, (req, res) => subscriptionController.checkQuota(req, res));
}
