import { eq, sql, desc, and, count, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { CreditTransaction } from '../../../domains/credits/entities';
import { userCredits, creditTransactions } from '../../database/schemas/user-schema';
import { getLogger } from '../../../config/service-urls';
import { getAuditService, getCorrelationContext } from '@aiponge/platform-core';
import { BillingError } from '../../../application/errors/errors';
import { GENERATION_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('credit-transaction-repository');

export class TransactionRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async refundCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<CreditTransaction> {
    const result = await this.db.transaction(
      async tx => {
        const [updatedCredits] = await tx
          .update(userCredits)
          .set({
            currentBalance: sql`${userCredits.currentBalance} + ${amount}`,
            totalSpent: sql`${userCredits.totalSpent} - ${amount}`,
            updatedAt: new Date(),
          })
          .where(and(eq(userCredits.userId, userId), isNull(userCredits.deletedAt)))
          .returning();

        if (!updatedCredits) {
          throw BillingError.notFound('User credits', userId);
        }

        const [transaction] = await tx
          .insert(creditTransactions)
          .values({
            userId,
            amount: amount,
            type: 'refund',
            status: GENERATION_STATUS.COMPLETED,
            description,
            metadata: metadata || {},
          })
          .returning();

        return { updatedCredits, transaction };
      },
      { isolationLevel: 'serializable' }
    );

    logger.info('Credits refunded', {
      userId,
      amount,
      transactionId: result.transaction.id,
      newBalance: result.updatedCredits.currentBalance,
    });

    getAuditService().log({
      userId,
      targetType: 'credit',
      targetId: result.transaction.id,
      action: 'create',
      changes: {
        amount: { old: null, new: amount },
        balance: { old: null, new: result.updatedCredits.currentBalance },
      },
      metadata: { operation: 'refundCredits', description },
      serviceName: 'user-service',
      correlationId: getCorrelationContext()?.correlationId,
    });

    return result.transaction as CreditTransaction;
  }

  async getTransactionHistory(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ transactions: CreditTransaction[]; total: number }> {
    const transactions = await this.db
      .select()
      .from(creditTransactions)
      .where(and(eq(creditTransactions.userId, userId), isNull(creditTransactions.deletedAt)))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(Math.min(limit || 20, 100))
      .offset(offset);

    const [{ value: total }] = await this.db
      .select({ value: count() })
      .from(creditTransactions)
      .where(and(eq(creditTransactions.userId, userId), isNull(creditTransactions.deletedAt)));

    return {
      transactions: transactions as CreditTransaction[],
      total: total || 0,
    };
  }

  async getTransactionById(transactionId: string): Promise<CreditTransaction | null> {
    const [transaction] = await this.db
      .select()
      .from(creditTransactions)
      .where(and(eq(creditTransactions.id, transactionId), isNull(creditTransactions.deletedAt)));
    return (transaction as CreditTransaction) || null;
  }

  async updateTransactionStatus(
    transactionId: string,
    status: 'pending' | 'completed' | 'failed' | 'refunded'
  ): Promise<void> {
    await this.db
      .update(creditTransactions)
      .set({ status })
      .where(and(eq(creditTransactions.id, transactionId), isNull(creditTransactions.deletedAt)));

    logger.debug('Transaction status updated', { transactionId, status });
  }
}
