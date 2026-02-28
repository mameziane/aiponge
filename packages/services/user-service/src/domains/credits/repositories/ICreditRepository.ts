/**
 * Credit Repository Interface
 * Handles all credit balance and transaction operations
 */

import { UserCredits, CreditBalance, CreditTransaction } from '../entities';

export interface ReserveCreditResult {
  success: boolean;
  transactionId?: string;
  currentBalance?: number;
  error?: string;
}

export interface CancelReservationResult {
  success: boolean;
  refundedAmount?: number;
  newBalance?: number;
  error?: string;
}

export interface SettleReservationResult {
  success: boolean;
  settledAmount?: number;
  refundedAmount?: number;
  newBalance?: number;
  error?: string;
}

export interface ICreditRepository {
  initializeCredits(userId: string, startingBalance: number): Promise<UserCredits>;

  getBalance(userId: string): Promise<CreditBalance | null>;

  hasCredits(userId: string): Promise<boolean>;

  reserveCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<ReserveCreditResult>;

  commitReservation(transactionId: string): Promise<void>;

  cancelReservation(transactionId: string, reason?: string): Promise<CancelReservationResult>;

  settleReservation(
    transactionId: string,
    actualAmount: number,
    metadata?: Record<string, unknown>
  ): Promise<SettleReservationResult>;

  refundCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<CreditTransaction>;

  getTransactionHistory(
    userId: string,
    limit?: number,
    offset?: number
  ): Promise<{ transactions: CreditTransaction[]; total: number }>;

  getTransactionById(transactionId: string): Promise<CreditTransaction | null>;

  updateTransactionStatus(transactionId: string, status: string): Promise<void>;

  cleanupOrphanedReservations(olderThanMinutes?: number): Promise<number>;
}
