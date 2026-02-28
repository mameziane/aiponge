/**
 * Credit Transaction Entity
 * Represents a single credit transaction (immutable audit record)
 */

export type CreditTransactionType = 'initial' | 'deduction' | 'refund' | 'topup';
export type CreditTransactionStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: CreditTransactionType;
  status: CreditTransactionStatus;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateCreditTransactionRequest {
  userId: string;
  amount: number;
  type: CreditTransactionType;
  description: string;
  metadata?: Record<string, unknown>;
}
