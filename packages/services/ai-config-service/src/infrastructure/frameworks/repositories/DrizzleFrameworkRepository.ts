/**
 * Drizzle Framework Repository
 * Implements framework persistence using Drizzle ORM
 */

import { eq, and } from 'drizzle-orm';
import { IFrameworkRepository } from '@domains/frameworks/domain/repositories/IFrameworkRepository';
import {
  PsychologicalFramework,
  FrameworkFilter,
  FrameworkCategory,
} from '@domains/frameworks/domain/entities/PsychologicalFramework';
import { DatabaseConnection } from '@infrastructure/database/DatabaseConnectionFactory';
import { cfgPsychologicalFrameworks } from '@schema/schema';
import { getLogger } from '@config/service-urls';
import { errorMessage } from '@aiponge/platform-core';
import { ConfigError } from '../../../application/errors';

const logger = getLogger('drizzle-framework-repository');

export class DrizzleFrameworkRepository implements IFrameworkRepository {
  constructor(private readonly db: DatabaseConnection) {
    logger.debug('Framework repository initialized');
  }

  async findAll(filter?: FrameworkFilter): Promise<PsychologicalFramework[]> {
    try {
      const conditions = [];

      if (filter?.category) {
        conditions.push(eq(cfgPsychologicalFrameworks.category, filter.category));
      }
      if (filter?.isEnabled !== undefined) {
        conditions.push(eq(cfgPsychologicalFrameworks.isEnabled, filter.isEnabled));
      }

      const query = this.db.select().from(cfgPsychologicalFrameworks);

      let results;
      if (conditions.length > 0) {
        results = await query.where(and(...conditions)).orderBy(cfgPsychologicalFrameworks.sortOrder);
      } else {
        results = await query.orderBy(cfgPsychologicalFrameworks.sortOrder);
      }

      return results.map(this.mapToEntity);
    } catch (error) {
      logger.error('Failed to find frameworks', { error: errorMessage(error) });
      throw ConfigError.frameworkError(
        'repository',
        'Failed to find frameworks',
        error instanceof Error ? error : undefined
      );
    }
  }

  async findById(id: string): Promise<PsychologicalFramework | null> {
    try {
      const result = await this.db
        .select()
        .from(cfgPsychologicalFrameworks)
        .where(eq(cfgPsychologicalFrameworks.id, id))
        .limit(1);

      if (!result[0]) {
        return null;
      }

      return this.mapToEntity(result[0]);
    } catch (error) {
      logger.error('Failed to find framework by ID', { id, error: errorMessage(error) });
      throw ConfigError.frameworkError(
        'repository',
        `Failed to find framework by ID: ${id}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async findByCategory(category: string): Promise<PsychologicalFramework[]> {
    try {
      const results = await this.db
        .select()
        .from(cfgPsychologicalFrameworks)
        .where(eq(cfgPsychologicalFrameworks.category, category as FrameworkCategory))
        .orderBy(cfgPsychologicalFrameworks.sortOrder);

      return results.map(this.mapToEntity);
    } catch (error) {
      logger.error('Failed to find frameworks by category', { category, error: errorMessage(error) });
      throw ConfigError.frameworkError(
        'repository',
        `Failed to find frameworks by category: ${category}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  async findEnabled(): Promise<PsychologicalFramework[]> {
    try {
      const results = await this.db
        .select()
        .from(cfgPsychologicalFrameworks)
        .where(eq(cfgPsychologicalFrameworks.isEnabled, true))
        .orderBy(cfgPsychologicalFrameworks.sortOrder);

      return results.map(this.mapToEntity);
    } catch (error) {
      logger.error('Failed to find enabled frameworks', { error: errorMessage(error) });
      throw ConfigError.frameworkError(
        'repository',
        'Failed to find enabled frameworks',
        error instanceof Error ? error : undefined
      );
    }
  }

  private mapToEntity(row: typeof cfgPsychologicalFrameworks.$inferSelect): PsychologicalFramework {
    return {
      id: row.id,
      name: row.name,
      shortName: row.shortName,
      category: row.category as FrameworkCategory,
      description: row.description,
      keyPrinciples: row.keyPrinciples || [],
      therapeuticGoals: row.therapeuticGoals || [],
      triggerPatterns: row.triggerPatterns || [],
      songStructureHint: row.songStructureHint,
      isEnabled: row.isEnabled,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
