/**
 * Persona Repository Implementation
 * Handles persistence and retrieval of user personas for enhanced personalization
 */

import { eq, and, desc, sql, isNull } from 'drizzle-orm';
import { DatabaseConnection } from '../database/DatabaseConnectionFactory';
import { usrUserPersonas, UserPersonaRecord, NewUserPersonaRecord } from '../database/schemas/profile-schema';
import { getLogger } from '../../config/service-urls';

const logger = getLogger('persona-repository');

export interface PersonaData {
  personality: {
    primaryTraits: Array<{ trait: string; score: number }>;
    secondaryTraits: Array<{ trait: string; score: number }>;
    personalityType: string;
    cognitiveStyle: string;
    emotionalProfile: {
      dominantEmotions: string[];
      emotionalRange: number;
      emotionalStability: number;
      resilience: number;
    };
  };
  behavior: {
    patterns: Array<{
      pattern: string;
      frequency: number;
      strength: number;
      trend: string;
    }>;
    preferences: {
      communicationStyle: string;
      learningStyle: string;
      decisionMaking: string;
      conflictResolution: string;
    };
    motivators: string[];
    stressors: string[];
  };
  cognitive: {
    thinkingPatterns: string[];
    problemSolvingStyle: string;
    creativity: number;
    analyticalThinking: number;
    intuitiveThinkers: number;
  };
  social: {
    relationshipStyle: string;
    socialNeeds: string[];
    communicationPreferences: string[];
  };
  growth: {
    developmentAreas: string[];
    strengths: string[];
    potentialGrowthPaths: string[];
  };
}

export interface PersistedPersona {
  id: string;
  userId: string;
  personaName: string;
  personaDescription: string | null;
  personality: PersonaData['personality'];
  behavior: PersonaData['behavior'];
  cognitive: PersonaData['cognitive'];
  social: PersonaData['social'];
  growth: PersonaData['growth'];
  confidence: number;
  dataPoints: number;
  version: string;
  sourceTimeframeStart: Date | null;
  sourceTimeframeEnd: Date | null;
  isActive: boolean;
  generatedAt: Date;
  updatedAt: Date;
}

export interface UpsertPersonaInput {
  userId: string;
  personaName: string;
  personaDescription?: string;
  personality: PersonaData['personality'];
  behavior: PersonaData['behavior'];
  cognitive: PersonaData['cognitive'];
  social: PersonaData['social'];
  growth: PersonaData['growth'];
  confidence: number;
  dataPoints: number;
  version?: string;
  sourceTimeframeStart?: Date;
  sourceTimeframeEnd?: Date;
}

export interface IPersonaRepository {
  upsertLatestPersona(input: UpsertPersonaInput): Promise<PersistedPersona>;
  getLatestPersona(userId: string): Promise<PersistedPersona | null>;
  getPersonaHistory(userId: string, limit?: number): Promise<PersistedPersona[]>;
  deletePersona(userId: string): Promise<void>;
  deactivateAllPersonas(userId: string): Promise<void>;
}

export class PersonaRepository implements IPersonaRepository {
  constructor(private readonly db: DatabaseConnection) {}

  private mapRecordToPersona(record: UserPersonaRecord): PersistedPersona {
    return {
      id: record.id,
      userId: record.userId,
      personaName: record.personaName,
      personaDescription: record.personaDescription,
      personality: record.personality as PersonaData['personality'],
      behavior: record.behavior as PersonaData['behavior'],
      cognitive: record.cognitive as PersonaData['cognitive'],
      social: record.social as PersonaData['social'],
      growth: record.growth as PersonaData['growth'],
      confidence: Number(record.confidence),
      dataPoints: record.dataPoints,
      version: record.version,
      sourceTimeframeStart: record.sourceTimeframeStart,
      sourceTimeframeEnd: record.sourceTimeframeEnd,
      isActive: record.isActive,
      generatedAt: record.generatedAt,
      updatedAt: record.updatedAt,
    };
  }

  async upsertLatestPersona(input: UpsertPersonaInput): Promise<PersistedPersona> {
    logger.info('Upserting persona for user: {}', { data0: input.userId });

    await this.db
      .update(usrUserPersonas)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(usrUserPersonas.userId, input.userId),
          eq(usrUserPersonas.isActive, true),
          isNull(usrUserPersonas.deletedAt)
        )
      );

    const [newRecord] = await this.db
      .insert(usrUserPersonas)
      .values({
        userId: input.userId,
        personaName: input.personaName,
        personaDescription: input.personaDescription,
        personality: input.personality,
        behavior: input.behavior,
        cognitive: input.cognitive,
        social: input.social,
        growth: input.growth,
        confidence: String(input.confidence),
        dataPoints: input.dataPoints,
        version: input.version || '2.0',
        sourceTimeframeStart: input.sourceTimeframeStart,
        sourceTimeframeEnd: input.sourceTimeframeEnd,
        isActive: true,
      })
      .returning();

    logger.info('Successfully persisted persona {} for user {}', {
      data0: newRecord.id,
      data1: input.userId,
    });

    return this.mapRecordToPersona(newRecord);
  }

  async getLatestPersona(userId: string): Promise<PersistedPersona | null> {
    const [record] = await this.db
      .select()
      .from(usrUserPersonas)
      .where(
        and(eq(usrUserPersonas.userId, userId), eq(usrUserPersonas.isActive, true), isNull(usrUserPersonas.deletedAt))
      )
      .orderBy(desc(usrUserPersonas.generatedAt))
      .limit(1);

    if (!record) {
      return null;
    }

    return this.mapRecordToPersona(record);
  }

  async getPersonaHistory(userId: string, limit = 10): Promise<PersistedPersona[]> {
    const records = await this.db
      .select()
      .from(usrUserPersonas)
      .where(and(eq(usrUserPersonas.userId, userId), isNull(usrUserPersonas.deletedAt)))
      .orderBy(desc(usrUserPersonas.generatedAt))
      .limit(Math.min(limit || 20, 100));

    return records.map(r => this.mapRecordToPersona(r));
  }

  async deletePersona(userId: string): Promise<void> {
    logger.info('Deleting all personas for user: {}', { data0: userId });

    await this.db.update(usrUserPersonas).set({ deletedAt: new Date() }).where(eq(usrUserPersonas.userId, userId));
  }

  async deactivateAllPersonas(userId: string): Promise<void> {
    logger.info('Deactivating all personas for user: {}', { data0: userId });

    await this.db
      .update(usrUserPersonas)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(usrUserPersonas.userId, userId), isNull(usrUserPersonas.deletedAt)));
  }
}
