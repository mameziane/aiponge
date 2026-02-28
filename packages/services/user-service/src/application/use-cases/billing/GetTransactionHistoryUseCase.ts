/**
 * Get Transaction History Use Case
 */

import { ICreditRepository } from '@domains/credits';
import { CreditTransaction } from '@domains/credits/entities';
import { getLogger } from '@config/service-urls';
import { BillingError } from '@application/errors';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('get-transaction-history-use-case');

export interface GetTransactionHistoryRequest {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface GetTransactionHistoryResponse {
  transactions: CreditTransaction[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export class GetTransactionHistoryUseCase {
  constructor(private creditRepository: ICreditRepository) {}

  async execute(request: GetTransactionHistoryRequest): Promise<GetTransactionHistoryResponse> {
    try {
      if (!request.userId?.trim()) {
        throw BillingError.userIdRequired();
      }

      const limit = request.limit || 50;
      const offset = request.offset || 0;

      const { transactions, total } = await this.creditRepository.getTransactionHistory(request.userId, limit, offset);

      const hasMore = offset + limit < total;

      logger.debug('Transaction history retrieved', {
        userId: request.userId,
        count: transactions.length,
        total,
      });

      return {
        transactions,
        pagination: {
          total,
          limit,
          offset,
          hasMore,
        },
      };
    } catch (error) {
      logger.error('Failed to get transaction history', {
        userId: request.userId,
        error: serializeError(error),
      });
      throw error;
    }
  }
}
