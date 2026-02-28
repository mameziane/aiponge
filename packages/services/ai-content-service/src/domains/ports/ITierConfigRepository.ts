import { TierConfigJson } from '@schema/content-schema';

export interface TierConfigRow {
  id: string;
  tier: string;
  config: TierConfigJson;
  isActive: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITierConfigRepository {
  getAllConfigs(): Promise<TierConfigRow[]>;
  getActiveConfigs(): Promise<TierConfigRow[]>;
  getConfigByTier(tier: string): Promise<TierConfigRow | null>;
  upsertConfig(tier: string, config: TierConfigJson): Promise<TierConfigRow>;
  updateConfig(tier: string, config: Partial<TierConfigJson>): Promise<TierConfigRow | null>;
  setActive(tier: string, isActive: boolean): Promise<boolean>;
}
