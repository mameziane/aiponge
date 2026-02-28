import { ExpoPushToken, InsertExpoPushToken } from '@domains/reminders/types';

export interface IExpoPushTokenRepository {
  upsert(userId: string, data: InsertExpoPushToken): Promise<ExpoPushToken>;
  findByUserId(userId: string): Promise<ExpoPushToken[]>;
  findActiveByUserId(userId: string): Promise<ExpoPushToken[]>;
  findByToken(token: string): Promise<ExpoPushToken | null>;
  deactivate(token: string): Promise<void>;
  deactivateAllForUser(userId: string): Promise<void>;
  updateLastUsed(token: string): Promise<void>;
}
