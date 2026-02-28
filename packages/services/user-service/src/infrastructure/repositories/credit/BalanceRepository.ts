import { eq, sql, and, count, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { UserCredits, CreditBalance } from '../../../domains/credits/entities';
import { userCredits, creditTransactions, creditOrders, creditGifts } from '../../database/schemas/user-schema';
import { getLogger } from '../../../config/service-urls';
import { getCorrelationContext, logAuditInTransaction } from '@aiponge/platform-core';
import { GENERATION_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('credit-balance-repository');

export class BalanceRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async initializeCredits(userId: string, startingBalance: number): Promise<UserCredits> {
    const [credits] = await this.db
      .insert(userCredits)
      .values({
        userId,
        startingBalance,
        currentBalance: startingBalance,
        totalSpent: 0,
      })
      .onConflictDoNothing()
      .returning();

    if (credits && startingBalance > 0) {
      await this.db.insert(creditTransactions).values({
        userId,
        amount: startingBalance,
        type: 'initial',
        status: GENERATION_STATUS.COMPLETED,
        description: `Initial credit balance of ${startingBalance}`,
        metadata: {},
      });
    }

    logger.info('Credits initialized for user', { userId, startingBalance });
    return credits;
  }

  async getBalance(userId: string): Promise<CreditBalance | null> {
    const [credits] = await this.db
      .select()
      .from(userCredits)
      .where(and(eq(userCredits.userId, userId), isNull(userCredits.deletedAt)));

    if (!credits) {
      return null;
    }

    return {
      userId: credits.userId,
      currentBalance: credits.currentBalance,
      totalSpent: credits.totalSpent,
      remaining: credits.currentBalance,
    };
  }

  async hasCredits(userId: string): Promise<boolean> {
    const [credits] = await this.db
      .select()
      .from(userCredits)
      .where(and(eq(userCredits.userId, userId), isNull(userCredits.deletedAt)));
    return credits ? credits.currentBalance > 0 : false;
  }

  async addCredits(
    userId: string,
    amount: number,
    type: string,
    description: string,
    metadata?: Record<string, unknown>
  ): Promise<typeof creditTransactions.$inferSelect> {
    const result = await this.db.transaction(
      async tx => {
        const [credits] = await tx
          .select()
          .from(userCredits)
          .where(and(eq(userCredits.userId, userId), isNull(userCredits.deletedAt)));

        if (!credits) {
          await tx.insert(userCredits).values({
            userId,
            startingBalance: 0,
            currentBalance: amount,
            totalSpent: 0,
          });
        } else {
          await tx
            .update(userCredits)
            .set({
              currentBalance: sql`${userCredits.currentBalance} + ${amount}`,
              updatedAt: new Date(),
            })
            .where(and(eq(userCredits.userId, userId), isNull(userCredits.deletedAt)));
        }

        const [transaction] = await tx
          .insert(creditTransactions)
          .values({
            userId,
            amount,
            type,
            status: GENERATION_STATUS.COMPLETED,
            description,
            metadata: metadata || {},
          })
          .returning();

        await logAuditInTransaction(tx, {
          userId,
          targetType: 'credit',
          targetId: transaction.id,
          action: 'create',
          changes: { amount: { old: null, new: amount } },
          metadata: { operation: 'addCredits', type, description },
          serviceName: 'user-service',
          correlationId: getCorrelationContext()?.correlationId,
        });

        return transaction;
      },
      { isolationLevel: 'serializable' }
    );

    logger.info('Credits added', { userId, amount, type, transactionId: result.id });

    return result;
  }

  async getPlatformCreditStats(): Promise<{
    totalUsers: number;
    totalCreditsBalance: number;
    totalCreditsSpent: number;
    totalOrders: number;
    totalOrderRevenue: number;
    totalGiftsSent: number;
    totalGiftsClaimed: number;
    avgCreditsPerUser: number;
  }> {
    const [[userStats], [orderStats], [giftStats]] = await Promise.all([
      this.db
        .select({
          totalUsers: count(userCredits.userId),
          totalCreditsBalance: sql<number>`COALESCE(SUM(${userCredits.currentBalance}), 0)`,
          totalCreditsSpent: sql<number>`COALESCE(SUM(${userCredits.totalSpent}), 0)`,
        })
        .from(userCredits)
        .where(isNull(userCredits.deletedAt)),
      this.db
        .select({
          totalOrders: count(creditOrders.id),
          totalOrderRevenue: sql<number>`COALESCE(SUM(${creditOrders.amountPaid}), 0)`,
        })
        .from(creditOrders)
        .where(and(eq(creditOrders.status, GENERATION_STATUS.COMPLETED), isNull(creditOrders.deletedAt))),
      this.db
        .select({
          totalGiftsSent: count(creditGifts.id),
          totalGiftsClaimed: sql<number>`COALESCE(SUM(CASE WHEN ${creditGifts.status} = 'claimed' THEN 1 ELSE 0 END), 0)`,
        })
        .from(creditGifts)
        .where(isNull(creditGifts.deletedAt)),
    ]);

    const totalUsers = Number(userStats?.totalUsers || 0);
    const totalCreditsBalance = Number(userStats?.totalCreditsBalance || 0);
    const totalCreditsSpent = Number(userStats?.totalCreditsSpent || 0);
    const totalOrders = Number(orderStats?.totalOrders || 0);
    const totalOrderRevenue = Number(orderStats?.totalOrderRevenue || 0);
    const totalGiftsSent = Number(giftStats?.totalGiftsSent || 0);
    const totalGiftsClaimed = Number(giftStats?.totalGiftsClaimed || 0);

    return {
      totalUsers,
      totalCreditsBalance,
      totalCreditsSpent,
      totalOrders,
      totalOrderRevenue,
      totalGiftsSent,
      totalGiftsClaimed,
      avgCreditsPerUser: totalUsers > 0 ? Math.round(totalCreditsBalance / totalUsers) : 0,
    };
  }
}
