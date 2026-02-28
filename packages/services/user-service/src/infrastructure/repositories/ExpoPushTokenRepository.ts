import { eq, and, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import { IExpoPushTokenRepository } from '../../domains/reminders/repositories/IExpoPushTokenRepository';
import { ExpoPushToken, InsertExpoPushToken, usrExpoPushTokens } from '../database/schemas/profile-schema';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('expo-push-token-repository');

export class ExpoPushTokenRepository implements IExpoPushTokenRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async upsert(userId: string, data: InsertExpoPushToken): Promise<ExpoPushToken> {
    const insertPayload: typeof usrExpoPushTokens.$inferInsert = {
      userId,
      token: data.token as string,
      deviceId: (data.deviceId as string | undefined) ?? null,
      platform: (data.platform as string | undefined) ?? null,
      isActive: (data.isActive as boolean | undefined) ?? true,
    };

    // Use onConflictDoUpdate to handle race conditions atomically
    const [result] = await this.db
      .insert(usrExpoPushTokens)
      .values(insertPayload)
      .onConflictDoUpdate({
        target: usrExpoPushTokens.token,
        set: {
          userId,
          isActive: true,
          platform: data.platform ?? null,
          deviceId: data.deviceId ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    logger.info('Expo push token upserted', { userId, tokenId: result.id });
    return result;
  }

  async findByUserId(userId: string): Promise<ExpoPushToken[]> {
    const tokens = await this.db
      .select()
      .from(usrExpoPushTokens)
      .where(and(eq(usrExpoPushTokens.userId, userId), isNull(usrExpoPushTokens.deletedAt)))
      .orderBy(usrExpoPushTokens.createdAt);

    return tokens;
  }

  async findActiveByUserId(userId: string): Promise<ExpoPushToken[]> {
    const tokens = await this.db
      .select()
      .from(usrExpoPushTokens)
      .where(
        and(
          eq(usrExpoPushTokens.userId, userId),
          eq(usrExpoPushTokens.isActive, true),
          isNull(usrExpoPushTokens.deletedAt)
        )
      );

    return tokens;
  }

  async findByToken(token: string): Promise<ExpoPushToken | null> {
    const [pushToken] = await this.db
      .select()
      .from(usrExpoPushTokens)
      .where(and(eq(usrExpoPushTokens.token, token), isNull(usrExpoPushTokens.deletedAt)));

    return pushToken || null;
  }

  async deactivate(token: string): Promise<void> {
    await this.db
      .update(usrExpoPushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(usrExpoPushTokens.token, token), isNull(usrExpoPushTokens.deletedAt)));

    logger.info('Expo push token deactivated', { token: token.substring(0, 20) + '...' });
  }

  async deactivateAllForUser(userId: string): Promise<void> {
    await this.db
      .update(usrExpoPushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(usrExpoPushTokens.userId, userId), isNull(usrExpoPushTokens.deletedAt)));

    logger.info('All expo push tokens deactivated for user', { userId });
  }

  async updateLastUsed(token: string): Promise<void> {
    await this.db
      .update(usrExpoPushTokens)
      .set({ lastUsedAt: new Date() })
      .where(and(eq(usrExpoPushTokens.token, token), isNull(usrExpoPushTokens.deletedAt)));
  }
}
