import { eq, sql, and, desc, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { userCredits, creditTransactions, creditOrders } from '../../database/schemas/user-schema';
import { getLogger } from '../../../config/service-urls';
import { getAuditService, getCorrelationContext } from '@aiponge/platform-core';
import { GENERATION_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('credit-order-repository');

export interface FulfillOrderInput {
  userId: string;
  transactionId: string;
  originalTransactionId?: string;
  appUserId?: string;
  productType: string;
  creditsGranted: number;
  amountPaid: number;
  currency: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePendingOrderInput {
  userId: string;
  transactionId: string;
  productType: string;
  creditsToGrant: number;
  amountPaid: number;
  currency: string;
  idempotencyKey?: string;
  status?: string;
}

export class OrderRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async fulfillOrder(input: FulfillOrderInput): Promise<{ orderId: string; transactionId: string }> {
    const idempotencyKey = input.metadata?.idempotency_key || input.metadata?.idempotencyKey;

    const result = await this.db.transaction(
      async tx => {
        const [existingCompletedOrder] = await tx
          .select()
          .from(creditOrders)
          .where(
            and(
              sql`(${creditOrders.transactionId} = ${input.transactionId} 
                OR ${creditOrders.metadata}->>'idempotencyKey' = ${idempotencyKey || ''}
                OR ${creditOrders.metadata}->>'idempotency_key' = ${idempotencyKey || ''})
                AND ${creditOrders.status} = 'completed'`,
              isNull(creditOrders.deletedAt)
            )
          )
          .limit(1);

        if (existingCompletedOrder) {
          logger.info('Order already fulfilled', {
            transactionId: input.transactionId,
            idempotencyKey,
            existingOrderId: existingCompletedOrder.id,
          });
          return { alreadyFulfilled: true as const, orderId: existingCompletedOrder.id };
        }

        const [pendingOrder] = await tx
          .select()
          .from(creditOrders)
          .where(
            and(
              sql`(${creditOrders.transactionId} = ${input.transactionId}
                OR ${creditOrders.metadata}->>'idempotencyKey' = ${idempotencyKey || ''}
                OR ${creditOrders.metadata}->>'idempotency_key' = ${idempotencyKey || ''})
                AND ${creditOrders.status} NOT IN ('completed', 'error')`,
              isNull(creditOrders.deletedAt)
            )
          )
          .limit(1);

        let order;

        if (pendingOrder) {
          [order] = await tx
            .update(creditOrders)
            .set({
              originalTransactionId: input.originalTransactionId,
              appUserId: input.appUserId,
              status: GENERATION_STATUS.COMPLETED,
              completedAt: new Date(),
              metadata: {
                ...((pendingOrder.metadata as Record<string, unknown>) || {}),
                ...(input.metadata || {}),
              },
            })
            .where(and(eq(creditOrders.id, pendingOrder.id), isNull(creditOrders.deletedAt)))
            .returning();
        } else {
          [order] = await tx
            .insert(creditOrders)
            .values({
              userId: input.userId,
              productType: input.productType,
              productId: (input.metadata?.product_id as string) || 'dynamic',
              transactionId: input.transactionId,
              originalTransactionId: input.originalTransactionId,
              appUserId: input.appUserId,
              creditsGranted: input.creditsGranted,
              amountPaid: input.amountPaid,
              currency: input.currency,
              status: GENERATION_STATUS.COMPLETED,
              metadata: input.metadata || {},
              completedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: creditOrders.transactionId,
              set: {
                status: GENERATION_STATUS.COMPLETED,
                completedAt: new Date(),
              },
            })
            .returning();
        }

        const [credits] = await tx
          .select()
          .from(userCredits)
          .where(and(eq(userCredits.userId, input.userId), isNull(userCredits.deletedAt)));

        if (!credits) {
          await tx.insert(userCredits).values({
            userId: input.userId,
            startingBalance: 0,
            currentBalance: input.creditsGranted,
            totalSpent: 0,
          });
        } else {
          await tx
            .update(userCredits)
            .set({
              currentBalance: sql`${userCredits.currentBalance} + ${input.creditsGranted}`,
              updatedAt: new Date(),
            })
            .where(and(eq(userCredits.userId, input.userId), isNull(userCredits.deletedAt)));
        }

        const [transaction] = await tx
          .insert(creditTransactions)
          .values({
            userId: input.userId,
            amount: input.creditsGranted,
            type: 'purchase',
            status: GENERATION_STATUS.COMPLETED,
            description: `Purchased ${input.creditsGranted} credits (${input.productType})`,
            metadata: {
              orderId: order.id,
              transactionId: input.transactionId,
              ...input.metadata,
            },
          })
          .returning();

        return { alreadyFulfilled: false as const, order, transaction };
      },
      { isolationLevel: 'serializable' }
    );

    if (result.alreadyFulfilled) {
      return { orderId: result.orderId, transactionId: '' };
    }

    logger.info('Order fulfilled successfully', {
      orderId: result.order.id,
      userId: input.userId,
      creditsGranted: input.creditsGranted,
    });

    getAuditService().log({
      userId: input.userId,
      targetType: 'credit',
      targetId: result.order.id,
      action: 'create',
      changes: {
        creditsGranted: { old: null, new: input.creditsGranted },
        amountPaid: { old: null, new: input.amountPaid },
      },
      metadata: {
        operation: 'fulfillOrder',
        productType: input.productType,
        transactionId: input.transactionId,
        currency: input.currency,
      },
      serviceName: 'user-service',
      correlationId: getCorrelationContext()?.correlationId,
    });

    return {
      orderId: result.order.id,
      transactionId: result.transaction.id,
    };
  }

  async createPendingOrder(input: CreatePendingOrderInput): Promise<{ orderId: string }> {
    if (input.idempotencyKey) {
      const existingOrder = await this.db
        .select()
        .from(creditOrders)
        .where(sql`${creditOrders.metadata}->>'idempotencyKey' = ${input.idempotencyKey}`)
        .limit(1);

      if (existingOrder.length > 0) {
        logger.info('Pending order already exists for idempotency key', {
          idempotencyKey: input.idempotencyKey,
          orderId: existingOrder[0].id,
        });
        return { orderId: existingOrder[0].id };
      }
    }

    const [order] = await this.db
      .insert(creditOrders)
      .values({
        userId: input.userId,
        productType: input.productType,
        productId: 'dynamic',
        transactionId: input.transactionId || null,
        creditsGranted: input.creditsToGrant,
        amountPaid: input.amountPaid,
        currency: input.currency,
        status: input.status || 'pending_payment',
        metadata: {
          idempotencyKey: input.idempotencyKey,
        },
      })
      .returning();

    logger.info('Pending order created', {
      orderId: order.id,
      idempotencyKey: input.idempotencyKey,
      userId: input.userId,
    });

    return { orderId: order.id };
  }

  async updatePendingOrderTransaction(orderId: string, transactionId: string): Promise<{ updated: boolean }> {
    const result = await this.db
      .update(creditOrders)
      .set({
        transactionId,
      })
      .where(and(eq(creditOrders.id, orderId), isNull(creditOrders.deletedAt)));

    logger.info('Pending order transaction updated', { orderId, transactionId });
    return { updated: true };
  }

  async updatePendingOrderStatus(
    orderId: string,
    status: string,
    errorMessage?: string
  ): Promise<{ updated: boolean }> {
    const updateData: Record<string, unknown> = {
      status,
    };

    if (errorMessage) {
      const [order] = await this.db
        .select()
        .from(creditOrders)
        .where(and(eq(creditOrders.id, orderId), isNull(creditOrders.deletedAt)));
      updateData.metadata = {
        ...((order?.metadata as Record<string, unknown>) || {}),
        errorMessage,
        errorAt: new Date().toISOString(),
      };
    }

    await this.db
      .update(creditOrders)
      .set(updateData)
      .where(and(eq(creditOrders.id, orderId), isNull(creditOrders.deletedAt)));

    logger.info('Pending order status updated', { orderId, status, errorMessage });
    return { updated: true };
  }

  async getOrders(userId: string, limit: number = 20, offset: number = 0): Promise<(typeof creditOrders.$inferSelect)[]> {
    const orders = await this.db
      .select()
      .from(creditOrders)
      .where(and(eq(creditOrders.userId, userId), isNull(creditOrders.deletedAt)))
      .orderBy(desc(creditOrders.createdAt))
      .limit(Math.min(limit || 20, 100))
      .offset(offset);
    return orders;
  }

  async grantRevenueCatCredits(input: {
    userId: string;
    productId: string;
    transactionId: string;
    creditsAmount: number;
  }): Promise<{
    creditsGranted: number;
    newBalance: number;
    alreadyGranted: boolean;
  }> {
    const { userId, productId, transactionId, creditsAmount } = input;
    const revenueCatTransactionId = `revenuecat_${transactionId}`;

    const result = await this.db.transaction(async tx => {
      const [existing] = await tx
        .select()
        .from(creditOrders)
        .where(and(eq(creditOrders.transactionId, revenueCatTransactionId), isNull(creditOrders.deletedAt)))
        .limit(1);

      if (existing) {
        const [currentCredits] = await tx
          .select()
          .from(userCredits)
          .where(and(eq(userCredits.userId, userId), isNull(userCredits.deletedAt)));
        return {
          alreadyGranted: true,
          newBalance: currentCredits?.currentBalance || 0,
          creditsGranted: 0,
        };
      }

      const [order] = await tx
        .insert(creditOrders)
        .values({
          userId,
          productType: 'revenuecat_iap',
          productId: productId,
          transactionId: revenueCatTransactionId,
          creditsGranted: creditsAmount,
          amountPaid: 0,
          currency: 'usd',
          status: GENERATION_STATUS.COMPLETED,
          metadata: {
            revenueCatTransactionId: transactionId,
            productId,
            source: 'revenuecat',
          },
          completedAt: new Date(),
        })
        .returning();

      const [existingCredits] = await tx
        .select()
        .from(userCredits)
        .where(and(eq(userCredits.userId, userId), isNull(userCredits.deletedAt)));

      let newBalance: number;

      if (!existingCredits) {
        const [newCredits] = await tx
          .insert(userCredits)
          .values({
            userId,
            startingBalance: 0,
            currentBalance: creditsAmount,
            totalSpent: 0,
          })
          .returning();
        newBalance = newCredits.currentBalance;
      } else {
        const [updatedCredits] = await tx
          .update(userCredits)
          .set({
            currentBalance: sql`${userCredits.currentBalance} + ${creditsAmount}`,
            updatedAt: new Date(),
          })
          .where(and(eq(userCredits.userId, userId), isNull(userCredits.deletedAt)))
          .returning();
        newBalance = updatedCredits.currentBalance;
      }

      await tx.insert(creditTransactions).values({
        userId,
        amount: creditsAmount,
        type: 'purchase',
        status: GENERATION_STATUS.COMPLETED,
        description: `RevenueCat credit purchase: ${productId}`,
        metadata: {
          orderId: order.id,
          revenueCatTransactionId: transactionId,
          productId,
        },
      });

      return { alreadyGranted: false, newBalance };
    });

    if (result.alreadyGranted) {
      logger.info('RevenueCat credits already granted (idempotent)', {
        userId,
        transactionId,
      });
    } else {
      logger.info('RevenueCat credits granted', {
        userId,
        transactionId,
        creditsAmount,
        newBalance: result.newBalance,
      });

      getAuditService().log({
        userId,
        targetType: 'credit',
        targetId: transactionId,
        action: 'create',
        changes: { creditsAmount: { old: null, new: creditsAmount }, balance: { old: null, new: result.newBalance } },
        metadata: { operation: 'grantRevenueCatCredits', productId },
        serviceName: 'user-service',
        correlationId: getCorrelationContext()?.correlationId,
      });
    }

    return {
      creditsGranted: creditsAmount,
      newBalance: result.newBalance,
      alreadyGranted: result.alreadyGranted,
    };
  }
}
