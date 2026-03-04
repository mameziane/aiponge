/**
 * Billing Validation Schemas
 *
 * Zod schemas for credit and subscription mutation endpoints.
 * These provide defense-in-depth validation on the backend service,
 * complementing the API gateway's first-line validation.
 */

import { z } from 'zod';
import { getValidation } from '@aiponge/platform-core';

const { validateBody } = getValidation();

// ──────────────────────────────────────────────
// Credit Mutation Schemas
// ──────────────────────────────────────────────

export const ReserveCreditsSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  description: z.string().min(1, 'Description is required').max(500),
  metadata: z.record(z.unknown()).optional(),
});

export const SettleReservationSchema = z.object({
  actualAmount: z.number().min(0, 'Actual amount must be non-negative'),
  metadata: z.record(z.unknown()).optional(),
});

export const CancelReservationSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const DeductCreditsSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  description: z.string().min(1, 'Description is required').max(500),
  metadata: z.record(z.unknown()).optional(),
});

export const RefundCreditsSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  reason: z.string().min(1, 'Reason is required').max(500),
  originalTransactionId: z.string().uuid().optional(),
});

export const ValidateCreditsSchema = z
  .object({
    amount: z.number().positive('Amount must be a positive number').optional(),
    requiredCredits: z.number().positive('Required credits must be a positive number').optional(),
  })
  .refine(data => data.amount || data.requiredCredits, {
    message: 'Either amount or requiredCredits is required',
  });

export const GrantRevenueCatCreditsSchema = z.object({
  userId: z.string().uuid().optional(),
  productId: z.string().min(1, 'Product ID is required').max(255),
  transactionId: z.string().min(1, 'Transaction ID is required').max(255),
});

export const FulfillOrderSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  userId: z.string().uuid(),
  productId: z.string().min(1, 'Product ID is required'),
  amount: z.number().positive(),
  transactionId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const CreatePendingOrderSchema = z.object({
  userId: z.string().uuid(),
  productId: z.string().min(1),
  amount: z.number().positive(),
  metadata: z.record(z.unknown()).optional(),
});

export const SendGiftSchema = z.object({
  senderId: z.string().uuid().optional(),
  recipientEmail: z.string().email().optional(),
  recipientId: z.string().uuid().optional(),
  amount: z.number().positive('Gift amount must be positive'),
  message: z.string().max(500).optional(),
});

export const ClaimGiftSchema = z.object({
  claimerId: z.string().uuid().optional(),
  claimToken: z.string().min(1, 'Claim token is required'),
});

// ──────────────────────────────────────────────
// Subscription Schemas
// ──────────────────────────────────────────────

export const CheckUsageLimitSchema = z.object({
  feature: z.string().min(1, 'Feature is required').max(100),
  amount: z.number().positive().optional().default(1),
});

export const IncrementUsageSchema = z.object({
  feature: z.string().min(1, 'Feature is required').max(100),
  amount: z.number().positive().optional().default(1),
});

export const CheckEligibilitySchema = z.object({
  feature: z.string().min(1, 'Feature is required').max(100),
  amount: z.number().positive().optional().default(1),
});

export const CheckQuotaSchema = z.object({
  feature: z.string().min(1, 'Feature is required').max(100),
  amount: z.number().positive().optional().default(1),
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
