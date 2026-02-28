import { Router, Request, Response } from 'express';
import { serviceAuthMiddleware } from '@aiponge/platform-core';
import type { CreditController } from '../controllers/CreditController';
import type { SubscriptionController } from '../controllers/SubscriptionController';

export interface BillingRouteDeps {
  creditController: CreditController;
  subscriptionController: SubscriptionController;
}

export function registerBillingRoutes(router: Router, deps: BillingRouteDeps): void {
  const { creditController, subscriptionController } = deps;

  // ==============================================
  // CREDIT ROUTES (12 endpoints)
  // ==============================================

  router.get('/credits/policy', (req, res) => creditController.getCreditPolicy(req, res));
  router.get('/credits/catalog', (req, res) => creditController.getProductCatalog(req, res));
  router.get('/credits/products', (req, res) => creditController.getProducts(req, res));
  router.post('/credits/products/seed', (req, res) => creditController.seedProducts(req, res));
  router.get('/credits/:userId/balance', (req, res) => creditController.getBalance(req, res));
  router.post('/credits/:userId/validate', (req, res) => creditController.validateCredits(req, res));
  router.post('/credits/:userId/deduct', (req, res) => creditController.deductCredits(req, res));
  router.post('/credits/:userId/refund', (req, res) => creditController.refundCredits(req, res));
  router.get('/credits/:userId/transactions', (req, res) => creditController.getTransactionHistory(req, res));

  // Credit Reservation (reserve-settle-cancel pattern for atomic operations)
  router.post('/credits/:userId/reserve', (req, res) => creditController.reserveCredits(req, res));
  router.post('/credits/reservations/:reservationId/settle', (req, res) =>
    creditController.settleReservation(req, res)
  );
  router.post('/credits/reservations/:reservationId/cancel', (req, res) =>
    creditController.cancelReservation(req, res)
  );

  // Credit Store - Order and Gift fulfillment
  router.post('/credits/fulfill', (req, res) => creditController.fulfillOrder(req, res));
  router.post('/credits/gift/send', (req, res) => creditController.sendGift(req, res));
  router.post('/credits/gift/claim', (req, res) => creditController.claimGift(req, res));
  router.post('/credits/grant-revenuecat', (req, res) => creditController.grantRevenueCatCredits(req, res));
  router.get('/credits/:userId/orders', (req, res) => creditController.getOrders(req, res));
  router.get('/credits/:userId/gifts/sent', (req, res) => creditController.getSentGifts(req, res));
  router.get('/credits/:userId/gifts/received', (req, res) => creditController.getReceivedGifts(req, res));
  router.get('/credits/:userId/gifts/pending', (req, res) => creditController.getPendingGifts(req, res));
  router.post('/credits/orders/pending', (req, res) => creditController.createPendingOrder(req, res));
  router.patch('/credits/orders/:orderId/transaction', (req, res) =>
    creditController.updatePendingOrderTransaction(req, res)
  );
  router.patch('/credits/orders/:orderId/status', (req, res) => creditController.updatePendingOrderStatus(req, res));

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
  router.post('/subscriptions/:userId/check-limit', (req, res) => subscriptionController.checkUsageLimit(req, res));
  router.post('/subscriptions/:userId/increment-usage', (req, res) => subscriptionController.incrementUsage(req, res));
  router.get('/subscriptions/:userId/entitlements/:entitlement', (req, res) =>
    subscriptionController.checkEntitlement(req, res)
  );
  router.get('/subscriptions/:userId/events', (req, res) => subscriptionController.getSubscriptionEvents(req, res));
  router.post('/subscriptions/webhook/revenuecat', (req, res) =>
    subscriptionController.processRevenueCatWebhook(req, res)
  );

  // Check usage eligibility (server-side feature gating)
  router.post('/subscriptions/:userId/check-eligibility', (req, res) =>
    subscriptionController.checkUsageEligibility(req, res)
  );

  // Unified quota check (subscription limits + credits in one call)
  router.post('/quota/:userId/check', (req, res) => subscriptionController.checkQuota(req, res));
}
