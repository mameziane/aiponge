import { eq, sql, and, desc, or, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { userCredits, creditTransactions, creditGifts, users } from '../../database/schemas/user-schema';
import { getLogger } from '../../../config/service-urls';
import { getAuditService, getCorrelationContext } from '@aiponge/platform-core';
import { GENERATION_STATUS } from '@aiponge/shared-contracts';

const logger = getLogger('credit-gift-repository');

export interface CreateGiftInput {
  senderId: string;
  recipientEmail: string;
  creditsAmount: number;
  claimToken: string;
  orderId?: string;
  message?: string;
  expiresAt: Date;
}

export class GiftRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async createGift(input: CreateGiftInput): Promise<{ giftId: string }> {
    const [gift] = await this.db
      .insert(creditGifts)
      .values({
        senderId: input.senderId,
        recipientEmail: input.recipientEmail,
        creditsAmount: input.creditsAmount,
        claimToken: input.claimToken,
        orderId: input.orderId,
        message: input.message,
        status: 'pending',
        expiresAt: input.expiresAt,
      })
      .returning();

    await this.db.insert(creditTransactions).values({
      userId: input.senderId,
      amount: -input.creditsAmount,
      type: 'gift_send',
      status: GENERATION_STATUS.COMPLETED,
      description: `Gift sent to ${input.recipientEmail}`,
      metadata: { giftId: gift.id },
    });

    logger.info('Gift created', { giftId: gift.id, senderId: input.senderId, recipientEmail: input.recipientEmail });

    getAuditService().log({
      userId: input.senderId,
      targetType: 'credit',
      targetId: gift.id,
      action: 'create',
      changes: { creditsAmount: { old: null, new: input.creditsAmount } },
      metadata: { operation: 'createGift', recipientEmail: input.recipientEmail },
      serviceName: 'user-service',
      correlationId: getCorrelationContext()?.correlationId,
    });

    return { giftId: gift.id };
  }

  async claimGift(claimToken: string, recipientId: string): Promise<{ creditsAmount: number } | null> {
    return await this.db.transaction(
      async tx => {
        const [gift] = await tx.execute(sql`
        SELECT id, credits_amount, expires_at FROM usr_credit_gifts 
        WHERE claim_token = ${claimToken} AND status = 'pending'
        FOR UPDATE
        LIMIT 1
      `);

        if (!gift) {
          logger.warn('Gift not found or already claimed', { claimToken });
          return null;
        }

        if (new Date() > new Date(gift.expires_at as string)) {
          await tx
            .update(creditGifts)
            .set({ status: 'expired' })
            .where(and(eq(creditGifts.id, gift.id as string), isNull(creditGifts.deletedAt)));
          logger.warn('Gift expired', { giftId: gift.id });
          return null;
        }

        await tx
          .update(creditGifts)
          .set({
            recipientId,
            status: 'claimed',
            claimedAt: new Date(),
          })
          .where(and(eq(creditGifts.id, gift.id as string), isNull(creditGifts.deletedAt)));

        const [credits] = await tx
          .select()
          .from(userCredits)
          .where(and(eq(userCredits.userId, recipientId), isNull(userCredits.deletedAt)));
        const creditsAmount = gift.credits_amount as number;

        if (!credits) {
          await tx.insert(userCredits).values({
            userId: recipientId,
            startingBalance: 0,
            currentBalance: creditsAmount,
            totalSpent: 0,
          });
        } else {
          await tx
            .update(userCredits)
            .set({
              currentBalance: sql`${userCredits.currentBalance} + ${creditsAmount}`,
              updatedAt: new Date(),
            })
            .where(and(eq(userCredits.userId, recipientId), isNull(userCredits.deletedAt)));
        }

        await tx.insert(creditTransactions).values({
          userId: recipientId,
          amount: creditsAmount,
          type: 'gift_receive',
          status: GENERATION_STATUS.COMPLETED,
          description: `Received gift of ${creditsAmount} credits`,
          metadata: { giftId: gift.id, senderId: gift.sender_id },
        });

        logger.info('Gift claimed', { giftId: gift.id, recipientId, creditsAmount });

        getAuditService().log({
          userId: recipientId,
          targetType: 'credit',
          targetId: gift.id as string,
          action: 'update',
          changes: { status: { old: 'pending', new: 'claimed' }, creditsAmount: { old: null, new: creditsAmount } },
          metadata: { operation: 'claimGift', senderId: gift.sender_id as string },
          serviceName: 'user-service',
          correlationId: getCorrelationContext()?.correlationId,
        });

        return { creditsAmount };
      },
      { isolationLevel: 'serializable' }
    );
  }

  async getSentGifts(userId: string): Promise<(typeof creditGifts.$inferSelect)[]> {
    const gifts = await this.db
      .select()
      .from(creditGifts)
      .where(and(eq(creditGifts.senderId, userId), isNull(creditGifts.deletedAt)))
      .orderBy(desc(creditGifts.createdAt));
    return gifts;
  }

  async getReceivedGifts(userId: string): Promise<(typeof creditGifts.$inferSelect)[]> {
    const [user] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    if (!user) {
      return [];
    }

    const gifts = await this.db
      .select()
      .from(creditGifts)
      .where(
        and(
          or(eq(creditGifts.recipientId, userId), eq(creditGifts.recipientEmail, user.email)),
          isNull(creditGifts.deletedAt)
        )
      )
      .orderBy(desc(creditGifts.createdAt));
    return gifts;
  }

  async getPendingGiftsForUser(userId: string): Promise<
    {
      id: string;
      creditsAmount: number;
      message: string | null;
      senderEmail: string | null;
      claimToken: string;
      expiresAt: Date;
    }[]
  > {
    const [user] = await this.db
      .select({ email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    if (!user?.email) {
      return [];
    }

    const gifts = await this.db
      .select({
        id: creditGifts.id,
        creditsAmount: creditGifts.creditsAmount,
        message: creditGifts.message,
        senderId: creditGifts.senderId,
        claimToken: creditGifts.claimToken,
        expiresAt: creditGifts.expiresAt,
      })
      .from(creditGifts)
      .where(
        and(
          eq(creditGifts.recipientEmail, user.email),
          eq(creditGifts.status, 'pending'),
          sql`${creditGifts.expiresAt} > NOW()`,
          isNull(creditGifts.deletedAt)
        )
      )
      .orderBy(desc(creditGifts.createdAt));

    const result = await Promise.all(
      gifts.map(async gift => {
        const [sender] = await this.db
          .select({ email: users.email })
          .from(users)
          .where(and(eq(users.id, gift.senderId), isNull(users.deletedAt)));
        return {
          id: gift.id,
          creditsAmount: gift.creditsAmount,
          message: gift.message,
          senderEmail: sender?.email || null,
          claimToken: gift.claimToken,
          expiresAt: gift.expiresAt,
        };
      })
    );

    logger.info('Retrieved pending gifts for user', { userId, count: result.length });
    return result;
  }
}
