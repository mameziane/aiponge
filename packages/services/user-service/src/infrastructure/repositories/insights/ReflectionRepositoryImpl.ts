/**
 * Reflection Repository Implementation
 * User reflections and contemplations
 */

import { DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import { IReflectionRepository } from '@domains/insights/repositories/IReflectionRepository';
import {
  usrReflections as reflections,
  Reflection,
  NewReflection,
} from '@infrastructure/database/schemas/profile-schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { getLogger } from '@config/service-urls';
import { encryptionService } from '@infrastructure/services';

const logger = getLogger('reflection-repository');

const SENSITIVE_REFLECTION_FIELDS = ['userResponse', 'challengeQuestion'] as const;
type SensitiveReflectionField = (typeof SENSITIVE_REFLECTION_FIELDS)[number];

export class ReflectionRepositoryImpl implements IReflectionRepository {
  constructor(private readonly db: DatabaseConnection) {}

  private encryptReflectionData(data: NewReflection): NewReflection {
    const encrypted = { ...data };
    for (const field of SENSITIVE_REFLECTION_FIELDS) {
      const value = encrypted[field as SensitiveReflectionField];
      if (value) {
        (encrypted as Record<string, unknown>)[field] = encryptionService.encrypt(value);
      }
    }
    return encrypted;
  }

  private decryptReflection(reflection: Reflection): Reflection {
    const decrypted = { ...reflection };
    for (const field of SENSITIVE_REFLECTION_FIELDS) {
      const value = decrypted[field as SensitiveReflectionField];
      if (value) {
        (decrypted as Record<string, unknown>)[field] = encryptionService.decrypt(value);
      }
    }
    return decrypted;
  }

  private decryptReflections(reflectionList: Reflection[]): Reflection[] {
    return reflectionList.map(r => this.decryptReflection(r));
  }

  async createReflection(reflection: NewReflection): Promise<Reflection> {
    const encryptedData = this.encryptReflectionData(reflection);
    const [result] = await this.db
      .insert(reflections)
      .values(encryptedData as typeof reflections.$inferInsert)
      .returning();
    logger.info('Reflection created', { id: result.id });
    return this.decryptReflection(result);
  }

  async findReflectionsByUserId(userId: string, limit: number = 50): Promise<Reflection[]> {
    const results = await this.db
      .select()
      .from(reflections)
      .where(and(eq(reflections.userId, userId), isNull(reflections.deletedAt)))
      .orderBy(desc(reflections.createdAt))
      .limit(Math.min(limit || 20, 100));
    return this.decryptReflections(results);
  }

  async updateReflection(id: string, data: Partial<Reflection>): Promise<Reflection> {
    const updateData = { ...data };

    for (const field of SENSITIVE_REFLECTION_FIELDS) {
      const value = updateData[field as keyof typeof updateData];
      if (value && typeof value === 'string') {
        (updateData as Record<string, unknown>)[field] = encryptionService.encrypt(value);
      }
    }

    const [result] = await this.db
      .update(reflections)
      .set(updateData)
      .where(and(eq(reflections.id, id), isNull(reflections.deletedAt)))
      .returning();

    return this.decryptReflection(result);
  }
}
