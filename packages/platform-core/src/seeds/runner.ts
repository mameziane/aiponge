import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import type { SeedContext, SeedRunnerOptions } from './types.js';
import { getOrderedSeeds, getSeedModule } from './registry.js';
import { ensureSeedHistoryTable, getLastSuccessfulRun, recordSeedRun } from './history.js';

function log(verbose: boolean, ...args: unknown[]): void {
  if (verbose) console.log(...args);
}

export async function runSeeds(options: SeedRunnerOptions = {}): Promise<void> {
  const { only, force = false, dryRun = false, verbose = true } = options;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required to run seeds');
  }

  const sql = neon(databaseUrl);
  const db = drizzle(sql);

  const ctx: SeedContext = { db, databaseUrl, verbose };

  log(verbose, '\n🌱 aiponge Seed Runner\n');

  if (!dryRun) {
    await ensureSeedHistoryTable(db);
  }

  let seeds = getOrderedSeeds();

  if (only) {
    const target = getSeedModule(only);
    if (!target) {
      const available = seeds.map(s => s.name).join(', ');
      throw new Error(`Seed "${only}" not found. Available: ${available}`);
    }
    seeds = seeds.filter(s => {
      if (s.name === only) return true;
      return collectDependencies(only, seeds).has(s.name);
    });
  }

  log(verbose, `Seeds to run: ${seeds.map(s => s.name).join(' → ')}\n`);

  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalDeleted = 0;
  let failCount = 0;

  for (const seed of seeds) {
    const lastRun = dryRun ? null : await getLastSuccessfulRun(db, seed.name);

    if (lastRun && lastRun.version === seed.version && !force) {
      log(verbose, `  ⏭  ${seed.name} v${seed.version} — already up to date`);
      totalSkipped++;
      continue;
    }

    if (dryRun) {
      log(verbose, `  🔍 ${seed.name} v${seed.version} — would run (dry-run)`);
      continue;
    }

    log(verbose, `  ▶  ${seed.name} v${seed.version} — ${seed.description}`);
    const startTime = Date.now();

    try {
      const result = await seed.seed(ctx);
      const durationMs = Date.now() - startTime;

      await recordSeedRun(db, {
        seedName: seed.name,
        version: seed.version,
        status: 'success',
        result,
        error: null,
        executedAt: new Date(),
        durationMs,
      });

      totalCreated += result.created;
      totalUpdated += result.updated;
      totalDeleted += result.deleted;

      const parts: string[] = [];
      if (result.created > 0) parts.push(`${result.created} created`);
      if (result.updated > 0) parts.push(`${result.updated} updated`);
      if (result.deleted > 0) parts.push(`${result.deleted} deleted`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`);

      log(verbose, `     ✅ Done in ${durationMs}ms — ${parts.join(', ') || 'no changes'}`);

      if (result.details?.length) {
        for (const detail of result.details) {
          log(verbose, `        ${detail}`);
        }
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);

      await recordSeedRun(db, {
        seedName: seed.name,
        version: seed.version,
        status: 'failed',
        result: null,
        error: errorMsg,
        executedAt: new Date(),
        durationMs,
      });

      console.error(`     ❌ FAILED: ${errorMsg}`);
      failCount++;
    }
  }

  log(
    verbose,
    `\n📊 Summary: ${totalCreated} created, ${totalUpdated} updated, ${totalDeleted} deleted, ${totalSkipped} skipped`
  );

  if (failCount > 0) {
    console.error(`\n⚠️  ${failCount} seed(s) failed`);
    process.exitCode = 1;
  } else {
    log(verbose, '\n✅ All seeds completed successfully\n');
  }
}

function collectDependencies(seedName: string, allSeeds: { name: string; dependencies: string[] }[]): Set<string> {
  const deps = new Set<string>();
  const mod = allSeeds.find(s => s.name === seedName);
  if (!mod) return deps;

  for (const dep of mod.dependencies) {
    deps.add(dep);
    const transitive = collectDependencies(dep, allSeeds);
    for (const d of transitive) deps.add(d);
  }

  return deps;
}
