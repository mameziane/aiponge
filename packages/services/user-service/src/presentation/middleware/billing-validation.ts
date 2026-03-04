/**
 * Billing Validation Schemas
 *
 * Zod schemas for credit and subscription mutation endpoints.
 * These provide defense-in-depth validation on the backend service,
 * complementing the API gateway's first-line validation.
 *
 * IMPORTANT: Field names MUST match what the controller destructures from req.body.
 * Zod `.parse()` strips unrecognized keys, so a schema mismatch silently removes
 * fields the controller needs.
 */

import { z } from 'zod';
import { getValidation } from '@aiponge/platform-core';

const { validateBody } = getValidation();

// ──────────────────────────────────────────────
// Credit Mutation Schemas
// ──────────────────────────────────────────────

// CreditController.reserveCredits: { amount, description, metadata }
export const ReserveCreditsSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  description: z.string().min(1, 'Description is required').max(500),
  metadata: z.record(z.unknown()).optional(),
});

// CreditController.settleReservation: { actualAmount, metadata }
export const SettleReservationSchema = z.object({
  actualAmount: z.number().min(0, 'Actual amount must be non-negative'),
  metadata: z.record(z.unknown()).optional(),
});

// CreditController.cancelReservation: { reason }
export const CancelReservationSchema = z.object({
  reason: z.string().max(500).optional(),
});

// CreditController.deductCredits: { amount, description, metadata }
export const DeductCreditsSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  description: z.string().min(1, 'Description is required').max(500),
  metadata: z.record(z.unknown()).optional(),
});

// CreditController.refundCredits: { amount, description, metadata }
export const RefundCreditsSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  description: z.string().min(1, 'Description is required').max(500),
  metadata: z.record(z.unknown()).optional(),
});

// CreditController.validateCredits: { amount?, requiredCredits? } (at least one)
export const ValidateCreditsSchema = z
  .object({
    amount: z.number().positive('Amount must be a positive number').optional(),
    requiredCredits: z.number().positive('Required credits must be a positive number').optional(),
  })
  .refine(data => data.amount !== undefined || data.requiredCredits !== undefined, {
    message: 'Either amount or requiredCredits is required',
  });

// CreditController.grantRevenueCatCredits: stub (not yet implemented), but validates incoming shape
export const GrantRevenueCatCreditsSchema = z.object({
  userId: z.string().uuid().optional(),
  productId: z.string().min(1, 'Product ID is required').max(255),
  transactionId: z.string().min(1, 'Transaction ID is required').max(255),
});

// CreditController.fulfillOrder: { userId, transactionId, originalTransactionId?, appUserId?,
//   productType?, creditsGranted, amountPaid?, currency?, metadata? }
export const FulfillOrderSchema = z.object({
  userId: z.string().uuid(),
  transactionId: z.string().min(1, 'Transaction ID is required'),
  originalTransactionId: z.string().optional(),
  appUserId: z.string().optional(),
  productType: z.string().max(100).optional(),
  creditsGranted: z.number().positive('Credits granted must be positive'),
  amountPaid: z.number().min(0).optional(),
  currency: z.string().max(10).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// CreditController.createPendingOrder: { userId, productId?, productType?, creditsToGrant?,
//   amountPaid?, currency?, idempotencyKey, status? }
export const CreatePendingOrderSchema = z.object({
  userId: z.string().uuid(),
  productId: z.string().optional(),
  productType: z.string().max(100).optional(),
  creditsToGrant: z.number().min(0).optional(),
  amountPaid: z.number().min(0).optional(),
  currency: z.string().max(10).optional(),
  idempotencyKey: z.string().min(1, 'Idempotency key is required'),
  status: z.string().max(50).optional(),
});

// CreditController.sendGift: stub (not yet implemented)
export const SendGiftSchema = z.object({
  senderId: z.string().uuid().optional(),
  recipientEmail: z.string().email().optional(),
  recipientId: z.string().uuid().optional(),
  amount: z.number().positive('Gift amount must be positive'),
  message: z.string().max(500).optional(),
});

// CreditController.claimGift: { claimToken }
export const ClaimGiftSchema = z.object({
  claimerId: z.string().uuid().optional(),
  claimToken: z.string().min(1, 'Claim token is required'),
});

// CreditController.updatePendingOrderTransaction: { transactionId }
export const UpdatePendingOrderTransactionSchema = z.object({
  transactionId: z.string().min(1, 'Transaction ID is required'),
});

// CreditController.updatePendingOrderStatus: { status }
export const UpdatePendingOrderStatusSchema = z.object({
  status: z.string().min(1, 'Status is required').max(50),
});

// ──────────────────────────────────────────────
// Subscription Schemas
// ──────────────────────────────────────────────

// SubscriptionController.checkUsageLimit: { type }
export const CheckUsageLimitSchema = z.object({
  type: z.enum(['songs', 'lyrics', 'insights'], {
    errorMap: () => ({ message: 'Type must be songs, lyrics, or insights' }),
  }),
});

// SubscriptionController.incrementUsage: { type }
export const IncrementUsageSchema = z.object({
  type: z.enum(['songs', 'lyrics', 'insights'], {
    errorMap: () => ({ message: 'Type must be songs, lyrics, or insights' }),
  }),
});

// SubscriptionController.checkUsageEligibility: { featureType }
export const CheckEligibilitySchema = z.object({
  featureType: z.enum(['songs', 'lyrics', 'insights'], {
    errorMap: () => ({ message: 'Feature type must be songs, lyrics, or insights' }),
  }),
});

// SubscriptionController.checkQuota: { action, creditCost?, userRole? }
export const CheckQuotaSchema = z.object({
  action: z.enum(['songs', 'lyrics', 'insights'], {
    errorMap: () => ({ message: 'Action must be songs, lyrics, or insights' }),
  }),
  creditCost: z.number().min(0).optional(),
  userRole: z.string().max(50).optional(),
});

// ──────────────────────────────────────────────
// Pre-built middleware (ready to use in routes)
// ──────────────────────────────────────────────

export const validateReserveCredits = validateBody(ReserveCreditsSchema);
export const validateSettleReservation = validateBody(SettleReservationSchema);
export const validateCancelReservation = validateBody(CancelReservationSchema);
export const validateDeductCredits = validateBody(DeductCreditsSchema);
export const validateRefundCredits = validateBody(RefundCreditsSchema);
export const validateValidateCredits = validateBody(ValidateCreditsSchema);
export const validateGrantRevenueCat = validateBody(GrantRevenueCatCreditsSchema);
export const validateFulfillOrder = validateBody(FulfillOrderSchema);
export const validateCreatePendingOrder = validateBody(CreatePendingOrderSchema);
export const validateSendGift = validateBody(SendGiftSchema);
export const validateClaimGift = validateBody(ClaimGiftSchema);
export const validateCheckUsageLimit = validateBody(CheckUsageLimitSchema);
export const validateIncrementUsage = validateBody(IncrementUsageSchema);
export const validateCheckEligibility = validateBody(CheckEligibilitySchema);
export const validateCheckQuota = validateBody(CheckQuotaSchema);
export const validateUpdatePendingOrderTransaction = validateBody(UpdatePendingOrderTransactionSchema);
export const validateUpdatePendingOrderStatus = validateBody(UpdatePendingOrderStatusSchema);
