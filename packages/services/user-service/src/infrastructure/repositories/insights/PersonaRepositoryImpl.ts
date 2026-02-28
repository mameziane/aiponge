import { eq, and, desc, gte, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import { usrUserPersonas } from '@infrastructure/database/schemas/profile-schema';
import { IPersonaRepository, PersonaFilter } from '@domains/insights/repositories/IPersonaRepository';
import type { Persona, InsertPersona } from '@domains/insights/types';

export class PersonaRepositoryImpl implements IPersonaRepository {
  constructor(private readonly db: DatabaseConnection) {}

  async findById(id: string): Promise<Persona | null> {
    const result = await this.db
      .select()
      .from(usrUserPersonas)
      .where(and(eq(usrUserPersonas.id, id), isNull(usrUserPersonas.deletedAt)))
      .limit(1);
    return result[0] || null;
  }

  async findByUserId(userId: string, filter?: PersonaFilter): Promise<Persona[]> {
    const conditions = [eq(usrUserPersonas.userId, userId), isNull(usrUserPersonas.deletedAt)];

    if (filter?.isActive !== undefined) {
      conditions.push(eq(usrUserPersonas.isActive, filter.isActive));
    }

    if (filter?.version) {
      conditions.push(eq(usrUserPersonas.version, filter.version));
    }

    if (filter?.minConfidence !== undefined) {
      conditions.push(gte(usrUserPersonas.confidence, filter.minConfidence.toString()));
    }

    let query = this.db
      .select()
      .from(usrUserPersonas)
      .where(and(...conditions))
      .orderBy(desc(usrUserPersonas.generatedAt));

    if (filter?.limit) {
      query = query.limit(Math.min(filter.limit || 20, 100)) as typeof query;
    }

    return query;
  }

  async findActivePersona(userId: string): Promise<Persona | null> {
    const result = await this.db
      .select()
      .from(usrUserPersonas)
      .where(
        and(eq(usrUserPersonas.userId, userId), eq(usrUserPersonas.isActive, true), isNull(usrUserPersonas.deletedAt))
      )
      .orderBy(desc(usrUserPersonas.generatedAt))
      .limit(1);
    return result[0] || null;
  }

  async findLatestPersona(userId: string): Promise<Persona | null> {
    const result = await this.db
      .select()
      .from(usrUserPersonas)
      .where(and(eq(usrUserPersonas.userId, userId), isNull(usrUserPersonas.deletedAt)))
      .orderBy(desc(usrUserPersonas.generatedAt))
      .limit(1);
    return result[0] || null;
  }

  async create(persona: InsertPersona): Promise<Persona> {
    const result = await this.db.insert(usrUserPersonas).values(persona).returning();
    return result[0];
  }

  async update(id: string, updates: Partial<InsertPersona>): Promise<Persona | null> {
    const result = await this.db
      .update(usrUserPersonas)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(usrUserPersonas.id, id), isNull(usrUserPersonas.deletedAt)))
      .returning();
    return result[0] || null;
  }

  async deactivateAll(userId: string): Promise<number> {
    const result = await this.db
      .update(usrUserPersonas)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(usrUserPersonas.userId, userId), isNull(usrUserPersonas.deletedAt)))
      .returning();
    return result.length;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = await this.db.delete(usrUserPersonas).where(eq(usrUserPersonas.userId, userId)).returning();
    return result.length;
  }
}
