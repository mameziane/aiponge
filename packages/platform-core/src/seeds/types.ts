import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface SeedContext {
  db: NodePgDatabase<Record<string, unknown>>;
  databaseUrl: string;
  verbose: boolean;
}

export interface SeedResult {
  created: number;
  updated: number;
  skipped: number;
  deleted: number;
  details?: string[];
}

export interface SeedModule {
  name: string;
  description: string;
  priority: number;
  dependencies: string[];
  version: string;
  seed: (ctx: SeedContext) => Promise<SeedResult>;
}

export interface SeedHistoryRecord {
  seedName: string;
  version: string;
  status: 'success' | 'failed';
  result: SeedResult | null;
  error: string | null;
  executedAt: Date;
  durationMs: number;
}

export interface SeedRunnerOptions {
  only?: string;
  force?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}
