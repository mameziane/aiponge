#!/usr/bin/env npx tsx
/**
 * Migration Safety Check Script
 * 
 * Pre-deployment validation for database migrations.
 * Detects pending migrations and warns about destructive changes.
 * 
 * Usage:
 *   npx tsx scripts/check-migrations.ts [service]
 * 
 * Examples:
 *   npx tsx scripts/check-migrations.ts          # Check all services
 *   npx tsx scripts/check-migrations.ts user     # Check user-service only
 * 
 * In CI, set ALLOW_DESTRUCTIVE_MIGRATIONS=true to proceed with destructive changes.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface ServiceConfig {
  name: string;
  path: string;
  tablePrefix: string;
  envVar: string;
}

const SERVICES: ServiceConfig[] = [
  { name: 'user-service', path: 'packages/services/user-service', tablePrefix: 'usr_', envVar: 'USER_DATABASE_URL' },
  { name: 'music-service', path: 'packages/services/music-service', tablePrefix: 'mus_', envVar: 'MUSIC_DATABASE_URL' },
  { name: 'ai-content-service', path: 'packages/services/ai-content-service', tablePrefix: 'aic_', envVar: 'AI_CONTENT_DATABASE_URL' },
  { name: 'ai-config-service', path: 'packages/services/ai-config-service', tablePrefix: 'cfg_', envVar: 'AI_CONFIG_DATABASE_URL' },
  { name: 'ai-analytics-service', path: 'packages/services/ai-analytics-service', tablePrefix: 'aia_', envVar: 'AI_ANALYTICS_DATABASE_URL' },
  { name: 'system-service', path: 'packages/services/system-service', tablePrefix: 'sys_', envVar: 'SYSTEM_DATABASE_URL' },
  { name: 'storage-service', path: 'packages/services/storage-service', tablePrefix: 'stg_', envVar: 'STORAGE_DATABASE_URL' },
];

const DESTRUCTIVE_PATTERNS = [
  /DROP\s+TABLE/i,
  /DROP\s+COLUMN/i,
  /ALTER\s+.*\s+TYPE/i,
  /DELETE\s+FROM/i,
  /TRUNCATE/i,
];

function isDestructive(sql: string): boolean {
  return DESTRUCTIVE_PATTERNS.some(pattern => pattern.test(sql));
}

function checkService(service: ServiceConfig): { hasPending: boolean; isDestructive: boolean; error?: string } {
  const drizzleDir = path.join(service.path, 'drizzle');
  
  if (!fs.existsSync(drizzleDir)) {
    return { hasPending: false, isDestructive: false };
  }

  try {
    const output = execSync(`npx drizzle-kit generate --config ${service.path}/drizzle.config.ts 2>&1`, {
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, [service.envVar]: process.env[service.envVar] || process.env.DATABASE_URL },
    });

    const hasPending = output.includes('migration file') || output.includes('changes detected');
    
    const migrationFiles = fs.readdirSync(drizzleDir).filter(f => f.endsWith('.sql'));
    const latestMigration = migrationFiles.sort().pop();
    
    let destructive = false;
    if (latestMigration) {
      const sqlContent = fs.readFileSync(path.join(drizzleDir, latestMigration), 'utf-8');
      destructive = isDestructive(sqlContent);
    }

    return { hasPending, isDestructive: destructive };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('No changes detected')) {
      return { hasPending: false, isDestructive: false };
    }
    return { hasPending: false, isDestructive: false, error: message };
  }
}

function main() {
  const targetService = process.argv[2];
  const servicesToCheck = targetService 
    ? SERVICES.filter(s => s.name.includes(targetService))
    : SERVICES;

  if (servicesToCheck.length === 0) {
    console.error(`❌ No service found matching: ${targetService}`);
    process.exit(1);
  }

  console.log('🔍 Checking database migrations...\n');

  let hasDestructive = false;
  let hasPending = false;

  for (const service of servicesToCheck) {
    const result = checkService(service);
    
    if (result.error) {
      console.log(`⚠️  ${service.name}: Check failed - ${result.error.substring(0, 100)}`);
      continue;
    }

    if (!result.hasPending) {
      console.log(`✅ ${service.name}: No pending migrations`);
    } else {
      hasPending = true;
      console.log(`⚠️  ${service.name}: Pending migrations detected`);
      
      if (result.isDestructive) {
        hasDestructive = true;
        console.log(`   🔴 DESTRUCTIVE CHANGES DETECTED - Review carefully!`);
      }
    }
  }

  console.log('');

  if (!hasPending) {
    console.log('✅ All services up to date - no pending migrations\n');
    process.exit(0);
  }

  if (hasDestructive) {
    console.log('⚠️  Destructive migrations detected!\n');
    
    if (process.env.CI) {
      if (process.env.ALLOW_DESTRUCTIVE_MIGRATIONS === 'true') {
        console.log('✅ ALLOW_DESTRUCTIVE_MIGRATIONS=true - proceeding with destructive changes\n');
        process.exit(0);
      } else {
        console.error('❌ Destructive migrations require ALLOW_DESTRUCTIVE_MIGRATIONS=true in CI\n');
        process.exit(1);
      }
    }
  }

  console.log('📋 Review pending migrations before deployment\n');
  process.exit(0);
}

main();
