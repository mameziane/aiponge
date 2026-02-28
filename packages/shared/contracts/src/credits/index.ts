/**
 * Credits Domain Contracts
 *
 * Shared types for credit-related operations across services:
 * - user-service (owner)
 * - music-service (consumer)
 * - api-gateway (consumer)
 */

import { z } from 'zod';

export const CreditTransactionTypeSchema = z.enum([
  'initial',
  'deduction',
  'refund',
  'topup',
  'purchase',
  'bonus',
  'gift',
]);
export type CreditTransactionType = z.infer<typeof CreditTransactionTypeSchema>;

export const CreditTransactionStatusSchema = z.enum(['pending', 'completed', 'failed', 'refunded', 'cancelled']);
export type CreditTransactionStatus = z.infer<typeof CreditTransactionStatusSchema>;

export const CreditBalanceSchema = z.object({
  userId: z.string(),
  currentBalance: z.number(),
  totalSpent: z.number(),
  remaining: z.number(),
});
export type CreditBalance = z.infer<typeof CreditBalanceSchema>;

export const CreditTransactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  amount: z.number(),
  type: CreditTransactionTypeSchema,
  status: CreditTransactionStatusSchema,
  description: z.string(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.union([z.string(), z.date()]),
});
export type CreditTransaction = z.infer<typeof CreditTransactionSchema>;

export const ValidateCreditsRequestSchema = z.object({
  userId: z.string(),
  amount: z.number(),
});
export type ValidateCreditsRequest = z.infer<typeof ValidateCreditsRequestSchema>;

export const ValidateCreditsResponseSchema = z.object({
  success: z.boolean(),
  hasCredits: z.boolean(),
  currentBalance: z.number(),
  required: z.number(),
  shortfall: z.number().optional(),
  error: z.string().optional(),
});
export type ValidateCreditsResponse = z.infer<typeof ValidateCreditsResponseSchema>;

export const DeductCreditsRequestSchema = z.object({
  userId: z.string(),
  amount: z.number(),
  description: z.string(),
  metadata: z.record(z.unknown()).optional(),
});
export type DeductCreditsRequest = z.infer<typeof DeductCreditsRequestSchema>;

export const DeductCreditsResponseSchema = z.object({
  success: z.boolean(),
  transactionId: z.string().optional(),
  newBalance: z.number().optional(),
  error: z.string().optional(),
});
export type DeductCreditsResponse = z.infer<typeof DeductCreditsResponseSchema>;

export const RefundCreditsRequestSchema = z.object({
  userId: z.string(),
  amount: z.number(),
  description: z.string(),
  metadata: z.record(z.unknown()).optional(),
});
export type RefundCreditsRequest = z.infer<typeof RefundCreditsRequestSchema>;

export const RefundCreditsResponseSchema = z.object({
  success: z.boolean(),
  transactionId: z.string().optional(),
  newBalance: z.number().optional(),
  error: z.string().optional(),
});
export type RefundCreditsResponse = z.infer<typeof RefundCreditsResponseSchema>;

export const CreditProductTypeSchema = z.enum(['credit_pack', 'deep_resonance', 'gift']);
export type CreditProductType = z.infer<typeof CreditProductTypeSchema>;

export const CreditOrderStatusSchema = z.enum(['pending', 'completed', 'failed', 'refunded']);
export type CreditOrderStatus = z.infer<typeof CreditOrderStatusSchema>;

export const CreditGiftStatusSchema = z.enum(['pending', 'claimed', 'expired', 'cancelled']);
export type CreditGiftStatus = z.infer<typeof CreditGiftStatusSchema>;
