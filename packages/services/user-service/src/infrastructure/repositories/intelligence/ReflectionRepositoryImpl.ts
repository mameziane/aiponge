import { eq, desc, and, sql, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import { usrReflections as reflections, usrReflectionTurns } from '../../database/schemas/profile-schema';
import type { Reflection, NewReflection, ReflectionTurn, NewReflectionTurn } from '../../../domains/insights/types';
import { getLogger } from '../../../config/service-urls';
import { encryptReflectionData, decryptReflection, decryptReflections, encryptionService } from './encryption-helpers';
import { ProfileError } from '../../../application/errors/errors';

const reflectionTurns = usrReflectionTurns;
const logger = getLogger('intelligence-repository');

export class ReflectionRepositoryPart {
  constructor(private readonly db: DatabaseConnection) {}

  async createReflection(reflectionData: NewReflection): Promise<Reflection> {
    const encryptedData = encryptReflectionData(reflectionData);
    const [reflection] = await this.db.insert(reflections).values(encryptedData).returning();
    logger.info('Reflection created', {
      id: reflection.id,
      userId: reflection.userId,
      encrypted: encryptionService.isEncryptionEnabled(),
    });
    return decryptReflection(reflection);
  }

  async findReflectionsByUserId(userId: string, limit: number = 50): Promise<Reflection[]> {
    const result = await this.db
      .select()
      .from(reflections)
      .where(and(eq(reflections.userId, userId), isNull(reflections.deletedAt)))
      .orderBy(desc(reflections.createdAt))
      .limit(Math.min(limit || 20, 100));
    return decryptReflections(result);
  }

  async updateReflection(id: string, data: Partial<Reflection>): Promise<Reflection> {
    const encryptedData = (data as Record<string, unknown>).content
      ? { ...data, content: encryptionService.encrypt((data as Record<string, unknown>).content as string) }
      : data;
    const [reflection] = await this.db
      .update(reflections)
      .set(encryptedData)
      .where(and(eq(reflections.id, id), isNull(reflections.deletedAt)))
      .returning();

    if (!reflection) throw ProfileError.notFound('Reflection', id);
    return decryptReflection(reflection);
  }

  async findReflectionById(id: string, userId: string): Promise<Reflection | null> {
    const [reflection] = await this.db
      .select()
      .from(reflections)
      .where(and(eq(reflections.id, id), eq(reflections.userId, userId), isNull(reflections.deletedAt)));
    return reflection || null;
  }

  async deleteReflection(id: string, userId: string): Promise<void> {
    await this.db
      .update(reflections)
      .set({ deletedAt: new Date() })
      .where(and(eq(reflections.id, id), eq(reflections.userId, userId)));
  }

  async createReflectionTurn(turnData: NewReflectionTurn): Promise<ReflectionTurn> {
    const [turn] = await this.db.insert(reflectionTurns).values(turnData).returning();
    logger.info('Reflection turn created', {
      id: turn.id,
      reflectionId: turn.reflectionId,
      turnNumber: turn.turnNumber,
    });
    return turn;
  }

  async findReflectionTurnsByReflectionId(reflectionId: string): Promise<ReflectionTurn[]> {
    return this.db
      .select()
      .from(reflectionTurns)
      .where(eq(reflectionTurns.reflectionId, reflectionId))
      .orderBy(reflectionTurns.turnNumber);
  }

  async updateReflectionTurn(id: string, data: Partial<ReflectionTurn>): Promise<ReflectionTurn> {
    const [turn] = await this.db.update(reflectionTurns).set(data).where(eq(reflectionTurns.id, id)).returning();
    if (!turn) throw ProfileError.notFound('ReflectionTurn', id);
    return turn;
  }

  async getMaxTurnNumber(reflectionId: string): Promise<number> {
    const result = await this.db
      .select({ maxTurn: sql<number>`COALESCE(MAX(${reflectionTurns.turnNumber}), 0)` })
      .from(reflectionTurns)
      .where(eq(reflectionTurns.reflectionId, reflectionId));
    return result[0]?.maxTurn ?? 0;
  }
}
