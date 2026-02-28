/**
 * Deduct Credits Use Case
 * Atomically deducts credits with reserve-commit pattern
 */

import { ICreditRepository, ReserveCreditResult } from '@domains/credits';
import { getLogger } from '@config/service-urls';
import { BillingError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('deduct-credits-use-case');

export interface DeductCreditsRequest {
  userId: string;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface DeductCreditsResponse {
  success: boolean;
  transactionId?: string;
  remainingBalance?: number;
  error?: string;
}

export class DeductCreditsUseCase {
  constructor(private creditRepository: ICreditRepository) {}

  async execute(request: DeductCreditsRequest): Promise<DeductCreditsResponse> {
    try {
      if (!request.userId?.trim()) {
        throw BillingError.userIdRequired();
      }

      if (request.amount <= 0) {
        throw BillingError.invalidAmount();
      }

      const result: ReserveCreditResult = await this.creditRepository.reserveCredits(
        request.userId,
        request.amount,
        request.description,
        request.metadata
      );

      if (!result.success) {
        logger.warn('Failed to deduct credits', {
          userId: request.userId,
          amount: request.amount,
          error: result.error,
        });
        return {
          success: false,
          error: result.error,
          remainingBalance: result.currentBalance,
        };
      }

      if (result.transactionId) {
        try {
          await this.creditRepository.commitReservation(result.transactionId);
        } catch (commitError) {
          logger.error('Failed to commit reservation, cancelling to refund credits', {
            transactionId: result.transactionId,
            userId: request.userId,
            error: commitError instanceof Error ? commitError.message : String(commitError),
          });
          try {
            await this.creditRepository.cancelReservation(result.transactionId, 'Commit failed - automatic rollback');
          } catch (cancelError) {
            logger.error('CRITICAL: Failed to cancel reservation after commit failure - orphaned pending transaction', {
              transactionId: result.transactionId,
              userId: request.userId,
              error: cancelError instanceof Error ? cancelError.message : String(cancelError),
            });
          }
          throw commitError;
        }
      }

      logger.info('Credits deducted successfully', {
        userId: request.userId,
        amount: request.amount,
        transactionId: result.transactionId,
        remainingBalance: result.currentBalance,
      });

      return {
        success: true,
        transactionId: result.transactionId,
        remainingBalance: result.currentBalance,
      };
    } catch (error) {
      logger.error('Failed to deduct credits', {
        userId: request.userId,
        error: serializeError(error),
      });
      throw error;
    }
  }
}
