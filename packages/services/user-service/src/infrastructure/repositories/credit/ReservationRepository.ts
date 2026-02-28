import { eq, sql, and, lt, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { ReserveCreditResult } from '../../../domains/credits/repositories/ICreditRepository';
import { userCredits, creditTransactions } from '../../database/schemas/user-schema';
import { getLogger } from '../../../config/service-urls';
import { serializeError, getCorrelationContext, logAuditInTransaction } from '@aiponge/platform-core';
import { BillingError } from '../../../application/errors/errors';
import { GENERATION_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('credit-reservation-repository');

export class ReservationRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async reserveCredits(
    userId: string,
    amount: number,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<ReserveCreditResult> {
    try {
      type TxResult =
        | { type: 'not_found' }
        | { type: 'insufficient'; currentBalance: number }
        | {
            type: 'success';
            updatedCredits: typeof userCredits.$inferSelect;
            transaction: typeof creditTransactions.$inferSelect;
          };

      const result: TxResult = await this.db.transaction(
        async tx => {
          const [updatedCredits] = await tx
            .update(userCredits)
            .set({
              currentBalance: sql`${userCredits.currentBalance} - ${amount}`,
              totalSpent: sql`${userCredits.totalSpent} + ${amount}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(userCredits.userId, userId),
                sql`${userCredits.currentBalance} >= ${amount}`,
                isNull(userCredits.deletedAt)
              )
            )
            .returning();

          if (!updatedCredits) {
            const [existing] = await tx
              .select({ currentBalance: userCredits.currentBalance })
              .from(userCredits)
              .where(and(eq(userCredits.userId, userId), isNull(userCredits.deletedAt)));

            if (!existing) {
              return { type: 'not_found' as const };
            }
            return { type: 'insufficient' as const, currentBalance: existing.currentBalance };
          }

          const [transaction] = await tx
            .insert(creditTransactions)
            .values({
              userId,
              amount: -amount,
              type: 'deduction',
              status: GENERATION_STATUS.PENDING,
              description,
              metadata: metadata || {},
            })
            .returning();

          await logAuditInTransaction(tx, {
            userId,
            targetType: 'credit',
            targetId: transaction.id,
            action: 'create',
            changes: {
              amount: { old: null, new: -amount },
              balance: { old: null, new: updatedCredits.currentBalance },
            },
            metadata: { operation: 'reserveCredits', description },
            serviceName: 'user-service',
            correlationId: getCorrelationContext()?.correlationId,
          });

          return { type: 'success' as const, updatedCredits, transaction };
        },
        { isolationLevel: 'serializable' }
      );

      if (result.type === 'not_found') {
        logger.warn('User credits not found', { userId });
        return {
          success: false,
          error: 'User credits not initialized',
        };
      }

      if (result.type === 'insufficient') {
        logger.warn('Insufficient credits', {
          userId,
          required: amount,
          available: result.currentBalance,
        });
        return {
          success: false,
          currentBalance: result.currentBalance,
          error: `Insufficient credits. Required: ${amount}, Available: ${result.currentBalance}`,
        };
      }

      logger.info('Credits reserved successfully', {
        userId,
        amount,
        transactionId: result.transaction.id,
        remainingBalance: result.updatedCredits.currentBalance,
      });

      return {
        success: true,
        transactionId: result.transaction.id,
        currentBalance: result.updatedCredits.currentBalance,
      };
    } catch (error) {
      logger.error('Error reserving credits', {
        userId,
        amount,
        error: serializeError(error),
      });
      return {
        success: false,
        error: 'Internal error while reserving credits',
      };
    }
  }

  async commitReservation(transactionId: string): Promise<void> {
    await this.db.transaction(async tx => {
      const [locked] = await tx
        .select({
          id: creditTransactions.id,
          userId: creditTransactions.userId,
          status: creditTransactions.status,
        })
        .from(creditTransactions)
        .where(and(eq(creditTransactions.id, transactionId), isNull(creditTransactions.deletedAt)))
        .for('update');

      if (!locked) {
        throw BillingError.notFound('Credit reservation', transactionId);
      }

      if (locked.status !== GENERATION_STATUS.PENDING) {
        throw BillingError.internalError(`Credit reservation already processed with status: ${locked.status}`);
      }

      await tx
        .update(creditTransactions)
        .set({ status: GENERATION_STATUS.COMPLETED })
        .where(eq(creditTransactions.id, transactionId));

      await logAuditInTransaction(tx, {
        userId: locked.userId,
        targetType: 'credit',
        targetId: transactionId,
        action: 'update',
        changes: { status: { old: 'pending', new: 'completed' } },
        metadata: { operation: 'commitReservation' },
        serviceName: 'user-service',
        correlationId: getCorrelationContext()?.correlationId,
      });
    });

    logger.info('Credit reservation committed', { transactionId });
  }

  async cancelReservation(
    transactionId: string,
    reason?: string
  ): Promise<{ success: boolean; refundedAmount?: number; newBalance?: number; error?: string }> {
    try {
      const [transaction] = await this.db
        .select()
        .from(creditTransactions)
        .where(and(eq(creditTransactions.id, transactionId), isNull(creditTransactions.deletedAt)));

      if (!transaction) {
        logger.warn('Transaction not found for cancellation', { transactionId });
        return { success: false, error: 'Transaction not found' };
      }

      if (transaction.status !== GENERATION_STATUS.PENDING) {
        logger.warn('Cannot cancel non-pending transaction', { transactionId, status: transaction.status });
        return { success: false, error: `Cannot cancel transaction with status: ${transaction.status}` };
      }

      const refundAmount = Math.abs(transaction.amount);

      const result = await this.db.transaction(
        async tx => {
          await tx
            .update(creditTransactions)
            .set({
              status: GENERATION_STATUS.CANCELLED,
              metadata: sql`${creditTransactions.metadata} || ${JSON.stringify({ cancelReason: reason || 'Reservation cancelled' })}::jsonb`,
            })
            .where(and(eq(creditTransactions.id, transactionId), isNull(creditTransactions.deletedAt)));

          const [updatedCredits] = await tx
            .update(userCredits)
            .set({
              currentBalance: sql`${userCredits.currentBalance} + ${refundAmount}`,
              totalSpent: sql`${userCredits.totalSpent} - ${refundAmount}`,
              updatedAt: new Date(),
            })
            .where(and(eq(userCredits.userId, transaction.userId), isNull(userCredits.deletedAt)))
            .returning();

          await logAuditInTransaction(tx, {
            userId: transaction.userId,
            targetType: 'credit',
            targetId: transactionId,
            action: 'update',
            changes: { status: { old: 'pending', new: 'cancelled' }, refundedAmount: { old: null, new: refundAmount } },
            metadata: { operation: 'cancelReservation', reason },
            serviceName: 'user-service',
            correlationId: getCorrelationContext()?.correlationId,
          });

          return { updatedCredits };
        },
        { isolationLevel: 'serializable' }
      );

      logger.info('Credit reservation cancelled', {
        transactionId,
        refundedAmount: refundAmount,
        newBalance: result.updatedCredits.currentBalance,
      });

      return {
        success: true,
        refundedAmount: refundAmount,
        newBalance: result.updatedCredits.currentBalance,
      };
    } catch (error) {
      logger.error('Error cancelling reservation', {
        transactionId,
        error: serializeError(error),
      });
      return { success: false, error: 'Internal error while cancelling reservation' };
    }
  }

  async settleReservation(
    transactionId: string,
    actualAmount: number,
    metadata?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    settledAmount?: number;
    refundedAmount?: number;
    newBalance?: number;
    error?: string;
  }> {
    try {
      const [transaction] = await this.db
        .select()
        .from(creditTransactions)
        .where(and(eq(creditTransactions.id, transactionId), isNull(creditTransactions.deletedAt)));

      if (!transaction) {
        logger.warn('Transaction not found for settlement', { transactionId });
        return { success: false, error: 'Transaction not found' };
      }

      if (transaction.status !== GENERATION_STATUS.PENDING) {
        logger.warn('Cannot settle non-pending transaction', { transactionId, status: transaction.status });
        return { success: false, error: `Cannot settle transaction with status: ${transaction.status}` };
      }

      const reservedAmount = Math.abs(transaction.amount);

      if (actualAmount > reservedAmount) {
        logger.warn('Cannot settle more than reserved', { transactionId, reservedAmount, actualAmount });
        return { success: false, error: `Cannot settle ${actualAmount} credits - only ${reservedAmount} reserved` };
      }

      const refundAmount = reservedAmount - actualAmount;

      const result = await this.db.transaction(
        async tx => {
          const mergedMetadata = {
            ...((transaction.metadata as object) || {}),
            ...(metadata || {}),
            settledAt: new Date().toISOString(),
          };

          await tx
            .update(creditTransactions)
            .set({
              status: GENERATION_STATUS.COMPLETED,
              amount: -actualAmount,
              metadata: mergedMetadata,
            })
            .where(and(eq(creditTransactions.id, transactionId), isNull(creditTransactions.deletedAt)));

          let updatedCredits;
          if (refundAmount > 0) {
            [updatedCredits] = await tx
              .update(userCredits)
              .set({
                currentBalance: sql`${userCredits.currentBalance} + ${refundAmount}`,
                totalSpent: sql`${userCredits.totalSpent} - ${refundAmount}`,
                updatedAt: new Date(),
              })
              .where(and(eq(userCredits.userId, transaction.userId), isNull(userCredits.deletedAt)))
              .returning();
          } else {
            [updatedCredits] = await tx
              .select()
              .from(userCredits)
              .where(and(eq(userCredits.userId, transaction.userId), isNull(userCredits.deletedAt)));
          }

          await logAuditInTransaction(tx, {
            userId: transaction.userId,
            targetType: 'credit',
            targetId: transactionId,
            action: 'update',
            changes: {
              status: { old: 'pending', new: 'completed' },
              settledAmount: { old: reservedAmount, new: actualAmount },
              refundedAmount: { old: null, new: refundAmount },
            },
            metadata: { operation: 'settleReservation' },
            serviceName: 'user-service',
            correlationId: getCorrelationContext()?.correlationId,
          });

          return { updatedCredits };
        },
        { isolationLevel: 'serializable' }
      );

      logger.info('Credit reservation settled', {
        transactionId,
        reservedAmount,
        settledAmount: actualAmount,
        refundedAmount: refundAmount,
        newBalance: result.updatedCredits?.currentBalance,
      });

      return {
        success: true,
        settledAmount: actualAmount,
        refundedAmount: refundAmount,
        newBalance: result.updatedCredits?.currentBalance,
      };
    } catch (error) {
      logger.error('Error settling reservation', {
        transactionId,
        actualAmount,
        error: serializeError(error),
      });
      return { success: false, error: 'Internal error while settling reservation' };
    }
  }

  async cleanupOrphanedReservations(olderThanMinutes: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);

    const orphanedTransactions = await this.db
      .select()
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.status, GENERATION_STATUS.PENDING),
          eq(creditTransactions.type, 'deduction'),
          lt(creditTransactions.createdAt, cutoff),
          isNull(creditTransactions.deletedAt)
        )
      );

    if (orphanedTransactions.length === 0) return 0;

    let refundedCount = 0;
    for (const txn of orphanedTransactions) {
      try {
        await this.db.transaction(
          async tx => {
            await tx
              .update(creditTransactions)
              .set({ status: GENERATION_STATUS.CANCELLED })
              .where(and(eq(creditTransactions.id, txn.id), isNull(creditTransactions.deletedAt)));

            const refundAmount = Math.abs(txn.amount);
            await tx
              .update(userCredits)
              .set({
                currentBalance: sql`${userCredits.currentBalance} + ${refundAmount}`,
                totalSpent: sql`GREATEST(${userCredits.totalSpent} - ${refundAmount}, 0)`,
                updatedAt: new Date(),
              })
              .where(and(eq(userCredits.userId, txn.userId), isNull(userCredits.deletedAt)));
          },
          { isolationLevel: 'serializable' }
        );
        refundedCount++;
        logger.info('Refunded orphaned reservation', {
          transactionId: txn.id,
          userId: txn.userId,
          amount: Math.abs(txn.amount),
        });
      } catch (error) {
        logger.error('Failed to refund orphaned reservation', { transactionId: txn.id, error: serializeError(error) });
      }
    }

    logger.info('Orphaned reservation cleanup complete', {
      found: orphanedTransactions.length,
      refunded: refundedCount,
    });
    return refundedCount;
  }
}
