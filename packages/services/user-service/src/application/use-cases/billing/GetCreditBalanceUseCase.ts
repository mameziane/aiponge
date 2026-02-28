/**
 * Get Credit Balance Use Case
 */

import { ICreditRepository } from '@domains/credits';
import { CreditBalance } from '@domains/credits/entities';
import { getLogger } from '@config/service-urls';
import { BillingError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('get-credit-balance-use-case');

export interface GetCreditBalanceRequest {
  userId: string;
}

export class GetCreditBalanceUseCase {
  constructor(private creditRepository: ICreditRepository) {}

  async execute(request: GetCreditBalanceRequest): Promise<CreditBalance | null> {
    try {
      if (!request.userId?.trim()) {
        throw BillingError.userIdRequired();
      }

      const balance = await this.creditRepository.getBalance(request.userId);

      if (!balance) {
        await this.creditRepository.initializeCredits(request.userId, 100);
        const newBalance = await this.creditRepository.getBalance(request.userId);
        logger.info('Credits initialized for user', { userId: request.userId, balance: newBalance?.currentBalance });
        return newBalance;
      }

      return balance;
    } catch (error) {
      logger.error('Failed to get credit balance', {
        userId: request.userId,
        error: serializeError(error),
      });
      throw error;
    }
  }
}
