import { eq } from 'drizzle-orm';
import { tierConfigs, TierConfigJson } from '@schema/content-schema';
import { getLogger } from '@config/service-urls';
import { DatabaseConnection } from '../DatabaseConnectionFactory';
import type { ITierConfigRepository, TierConfigRow } from '../../../domains/ports/ITierConfigRepository';

const logger = getLogger('tier-config-repository');

export type { TierConfigRow };

export class DrizzleTierConfigRepository implements ITierConfigRepository {
  constructor(private db: DatabaseConnection) {}

  private toRow(row: unknown): TierConfigRow {
    const r = row as {
      id: string;
      tier: string;
      config: unknown;
      isActive: boolean;
      version: number;
      createdAt: Date;
      updatedAt: Date;
    };
    return {
      id: r.id,
      tier: r.tier,
      config: r.config as TierConfigJson,
      isActive: r.isActive,
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async getAllConfigs(): Promise<TierConfigRow[]> {
    try {
      const results = await this.db.select().from(tierConfigs).orderBy(tierConfigs.tier);
      return results.map(r => this.toRow(r));
    } catch (error) {
      logger.error('Failed to get all tier configs', { error });
      throw error;
    }
  }

  async getActiveConfigs(): Promise<TierConfigRow[]> {
    try {
      const results = await this.db
        .select()
        .from(tierConfigs)
        .where(eq(tierConfigs.isActive, true))
        .orderBy(tierConfigs.tier);
      return results.map(r => this.toRow(r));
    } catch (error) {
      logger.error('Failed to get active tier configs', { error });
      throw error;
    }
  }

  async getConfigByTier(tier: string): Promise<TierConfigRow | null> {
    try {
      const results = await this.db.select().from(tierConfigs).where(eq(tierConfigs.tier, tier.toLowerCase())).limit(1);
      return results[0] ? this.toRow(results[0]) : null;
    } catch (error) {
      logger.error('Failed to get tier config', { tier, error });
      throw error;
    }
  }

  async upsertConfig(tier: string, config: TierConfigJson): Promise<TierConfigRow> {
    try {
      const normalizedTier = tier.toLowerCase();
      const existing = await this.getConfigByTier(normalizedTier);

      if (existing) {
        const updated = await this.db
          .update(tierConfigs)
          .set({
            config,
            version: existing.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(tierConfigs.tier, normalizedTier))
          .returning();
        return this.toRow(updated[0]);
      }

      const inserted = await this.db
        .insert(tierConfigs)
        .values({
          tier: normalizedTier,
          config,
          isActive: true,
          version: 1,
        })
        .returning();
      return this.toRow(inserted[0]);
    } catch (error) {
      logger.error('Failed to upsert tier config', { tier, error });
      throw error;
    }
  }

  async updateConfig(tier: string, configUpdates: Partial<TierConfigJson>): Promise<TierConfigRow | null> {
    try {
      const existing = await this.getConfigByTier(tier);
      if (!existing) return null;

      const mergedConfig: TierConfigJson = {
        ...existing.config,
        ...configUpdates,
        limits: {
          ...existing.config.limits,
          ...(configUpdates.limits || {}),
        },
        features: {
          ...existing.config.features,
          ...(configUpdates.features || {}),
        },
        creditCosts:
          configUpdates.creditCosts !== undefined
            ? { ...existing.config.creditCosts, ...configUpdates.creditCosts }
            : existing.config.creditCosts,
        generationSettings:
          configUpdates.generationSettings !== undefined
            ? { ...existing.config.generationSettings, ...configUpdates.generationSettings }
            : existing.config.generationSettings,
        ui: {
          ...existing.config.ui,
          ...(configUpdates.ui || {}),
        },
      };

      const updated = await this.db
        .update(tierConfigs)
        .set({
          config: mergedConfig,
          version: existing.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(tierConfigs.tier, tier.toLowerCase()))
        .returning();

      return updated[0] ? this.toRow(updated[0]) : null;
    } catch (error) {
      logger.error('Failed to update tier config', { tier, error });
      throw error;
    }
  }

  async setActive(tier: string, isActive: boolean): Promise<boolean> {
    try {
      const result = await this.db
        .update(tierConfigs)
        .set({ isActive, updatedAt: new Date() })
        .where(eq(tierConfigs.tier, tier.toLowerCase()))
        .returning();
      return result.length > 0;
    } catch (error) {
      logger.error('Failed to set tier active status', { tier, isActive, error });
      throw error;
    }
  }
}
