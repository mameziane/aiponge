/**
 * Validate Credits Use Case
 * Checks if user has sufficient credits without deducting
 */

import { ICreditRepository } from '@domains/credits';
import { getLogger } from '@config/service-urls';
import { BillingError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('validate-credits-use-case');

export interface ValidateCreditsRequest {
  userId: string;
  amount: number;
}

export interface ValidateCreditsResponse {
  success: boolean;
  hasCredits: boolean;
  currentBalance: number;
  required: number;
  shortfall?: number;
  error?: string;
}

export class ValidateCreditsUseCase {
  constructor(private creditRepository: ICreditRepository) {}

  async execute(request: ValidateCreditsRequest): Promise<ValidateCreditsResponse> {
    try {
      if (!request.userId?.trim()) {
        throw BillingError.userIdRequired();
      }

      if (request.amount <= 0) {
        throw BillingError.invalidAmount();
      }

      const balance = await this.creditRepository.getBalance(request.userId);

      if (!balance) {
        logger.warn('User credits not initialized', { userId: request.userId });
        return {
          success: true,
          hasCredits: false,
          currentBalance: 0,
          required: request.amount,
          shortfall: request.amount,
          error: 'User credits not initialized',
        };
      }

      const hasCredits = balance.currentBalance >= request.amount;

      if (!hasCredits) {
        logger.info('Insufficient credits', {
          userId: request.userId,
          required: request.amount,
          available: balance.currentBalance,
        });
      }

      return {
        success: true,
        hasCredits,
        currentBalance: balance.currentBalance,
        required: request.amount,
        shortfall: hasCredits ? undefined : request.amount - balance.currentBalance,
        error: hasCredits
          ? undefined
          : `Insufficient credits. Required: ${request.amount}, Available: ${balance.currentBalance}`,
      };
    } catch (error) {
      logger.error('Failed to validate credits', {
        userId: request.userId,
        error: serializeError(error),
      });
      throw error;
    }
  }
}
