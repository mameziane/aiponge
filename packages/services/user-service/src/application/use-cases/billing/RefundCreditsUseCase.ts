/**
 * Refund Credits Use Case
 * Refunds previously deducted credits
 */

import { ICreditRepository } from '@domains/credits';
import { CreditTransaction } from '@domains/credits/entities';
import { getLogger } from '@config/service-urls';
import { BillingError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('refund-credits-use-case');

export interface RefundCreditsRequest {
  userId: string;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
}

export class RefundCreditsUseCase {
  constructor(private creditRepository: ICreditRepository) {}

  async execute(request: RefundCreditsRequest): Promise<CreditTransaction> {
    try {
      if (!request.userId?.trim()) {
        throw BillingError.userIdRequired();
      }

      if (request.amount <= 0) {
        throw BillingError.invalidAmount();
      }

      const transaction = await this.creditRepository.refundCredits(
        request.userId,
        request.amount,
        request.description,
        request.metadata
      );

      logger.info('Credits refunded successfully', {
        userId: request.userId,
        amount: request.amount,
        transactionId: transaction.id,
      });

      return transaction;
    } catch (error) {
      logger.error('Failed to refund credits', {
        userId: request.userId,
        error: serializeError(error),
      });
      throw error;
    }
  }
}
