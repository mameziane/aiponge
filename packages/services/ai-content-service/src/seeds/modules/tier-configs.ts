import type { SeedModule, SeedContext, SeedResult } from '@aiponge/platform-core';
import { TIER_IDS } from '@aiponge/shared-contracts';

function escSql(str: string): string {
  return str.replace(/'/g, "''");
}

const TIER_CONFIGS = [
  {
    tier: TIER_IDS.GUEST,
    config: {
      ui: { sortOrder: 0 },
      price: null,
      limits: { booksPerMonth: 0, songsPerMonth: 1, lyricsPerMonth: 1, insightsPerMonth: 0, songExpiresAfterHours: 48 },
      features: {
        maxBookDepth: null,
        canAccessLibrary: false,
        canGenerateBooks: false,
        canGenerateMusic: true,
        canAccessMentorLine: false,
        canAccessInsightsReports: false,
        canAccessActivityCalendar: false,
        canSelectFramework: false,
        canSelectMusicStyle: true,
        canShareSongs: false,
        canAccessJournal: false,
      },
      displayName: 'Guest',
      entitlementId: null,
    },
  },
  {
    tier: TIER_IDS.EXPLORER,
    config: {
      ui: { sortOrder: 1 },
      price: null,
      limits: { booksPerMonth: 0, songsPerMonth: 2, lyricsPerMonth: 4, insightsPerMonth: 3 },
      features: {
        maxBookDepth: null,
        canAccessLibrary: true,
        canGenerateBooks: false,
        canGenerateMusic: true,
        canAccessMentorLine: false,
        canAccessInsightsReports: false,
        canAccessActivityCalendar: false,
        canSelectFramework: false,
        canSelectMusicStyle: true,
        canShareSongs: true,
        canAccessJournal: true,
      },
      displayName: 'Explorer',
      entitlementId: null,
    },
  },
  {
    tier: TIER_IDS.PERSONAL,
    config: {
      ui: { sortOrder: 2, badgeColor: '#4CAF50' },
      price: '$9.99/month',
      annualPrice: '$79.99/year',
      limits: { booksPerMonth: 2, songsPerMonth: 15, lyricsPerMonth: 30, insightsPerMonth: 30 },
      features: {
        maxBookDepth: 'standard',
        canAccessLibrary: true,
        canGenerateBooks: true,
        canGenerateMusic: true,
        canAccessMentorLine: true,
        canAccessInsightsReports: false,
        canAccessActivityCalendar: true,
        canSelectFramework: false,
        canSelectMusicStyle: true,
        canShareSongs: true,
        canAccessJournal: true,
      },
      displayName: 'Personal',
      entitlementId: 'personal',
    },
  },
  {
    tier: TIER_IDS.PRACTICE,
    config: {
      ui: { sortOrder: 3, badgeColor: '#FFD700' },
      price: '$49.00/month',
      annualPrice: '$399.99/year',
      limits: { booksPerMonth: -1, songsPerMonth: 50, lyricsPerMonth: 100, insightsPerMonth: -1, maxSharedClients: 50 },
      features: {
        maxBookDepth: 'deep',
        canAccessLibrary: true,
        canGenerateBooks: true,
        canGenerateMusic: true,
        canAccessMentorLine: true,
        canAccessInsightsReports: true,
        canAccessActivityCalendar: true,
        canSelectFramework: true,
        canSelectMusicStyle: true,
        canShareSongs: true,
        canAccessJournal: true,
        canShareWithClients: true,
        canViewClientReflections: true,
        canViewClientEngagement: true,
        canBatchGenerate: true,
        songBranding: 'aiponge',
      },
      displayName: 'Practice',
      entitlementId: 'practice',
    },
  },
  {
    tier: TIER_IDS.STUDIO,
    config: {
      ui: { sortOrder: 4, badgeColor: '#E040FB' },
      price: '$149.00/month',
      annualPrice: '$1199.99/year',
      limits: {
        booksPerMonth: -1,
        songsPerMonth: 150,
        lyricsPerMonth: 300,
        insightsPerMonth: -1,
        maxSharedClients: -1,
      },
      features: {
        maxBookDepth: 'deep',
        canAccessLibrary: true,
        canGenerateBooks: true,
        canGenerateMusic: true,
        canAccessMentorLine: true,
        canAccessInsightsReports: true,
        canAccessActivityCalendar: true,
        canSelectFramework: true,
        canSelectMusicStyle: true,
        canShareSongs: true,
        canAccessJournal: true,
        canShareWithClients: true,
        canViewClientReflections: true,
        canViewClientEngagement: true,
        canBatchGenerate: true,
        canWhiteLabel: true,
        canAccessAPI: true,
        songBranding: 'custom',
      },
      displayName: 'Studio',
      entitlementId: 'studio',
    },
  },
];

export const tierConfigsSeed: SeedModule = {
  name: 'tier-configs',
  description: 'Seed aic_tier_configs with all subscription tier definitions (5-tier model)',
  priority: 15,
  dependencies: [],
  version: '2.0.0',

  async seed(ctx: SeedContext): Promise<SeedResult> {
    const result: SeedResult = { created: 0, updated: 0, skipped: 0, deleted: 0, details: [] };
    const db = ctx.db as { execute: (query: string) => Promise<unknown> };

    await db.execute(
      `UPDATE aic_tier_configs SET is_active = false WHERE tier NOT IN ('${TIER_IDS.GUEST}', '${TIER_IDS.EXPLORER}', '${TIER_IDS.PERSONAL}', '${TIER_IDS.PRACTICE}', '${TIER_IDS.STUDIO}')`
    );

    for (const tierDef of TIER_CONFIGS) {
      const configJson = JSON.stringify(tierDef.config);

      await db.execute(
        `INSERT INTO aic_tier_configs (id, tier, config, is_active, version, created_at, updated_at)
         VALUES (
           gen_random_uuid(),
           '${escSql(tierDef.tier)}',
           '${escSql(configJson)}'::jsonb,
           true,
           1,
           NOW(),
           NOW()
         )
         ON CONFLICT (tier) DO UPDATE SET
           config = EXCLUDED.config,
           is_active = EXCLUDED.is_active,
           updated_at = NOW()`
      );

      result.created++;
      result.details!.push(`Upserted tier: ${tierDef.tier} (${tierDef.config.displayName})`);
    }

    return result;
  },
};
