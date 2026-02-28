#!/usr/bin/env tsx
/**
 * Validate Service Config Freshness
 *
 * Checks that the generated service configuration is fresh and valid.
 * Used in CI/CD pipelines and pre-build validation.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

function validateConfigFreshness() {
  const configPath = resolve(__dirname, '../apps/shared/config/generated/service-config.ts');

  if (!existsSync(configPath)) {
    console.error('❌ Generated config file not found!');
    console.error(`   Expected: ${configPath}`);
    console.error('   Run: npm run generate:config');
    process.exit(1);
  }

  const content = readFileSync(configPath, 'utf-8');

  // Extract metadata
  const generatedMatch = content.match(/generated: "([^"]+)"/);
  const hashMatch = content.match(/sourceHash: "([^"]+)"/);
  const portMatch = content.match(/apiGatewayPort: (\d+)/);

  if (!generatedMatch || !hashMatch || !portMatch) {
    console.error('❌ Invalid config format - missing metadata');
    console.error('   Expected fields: generated, sourceHash, apiGatewayPort');
    console.error('   Run: npm run generate:config');
    process.exit(1);
  }

  const generated = new Date(generatedMatch[1]);
  const age = Date.now() - generated.getTime();
  const ageHours = Math.round(age / (60 * 60 * 1000));

  console.log('📋 Config validation:');
  console.log(`   File: ${configPath}`);
  console.log(`   Generated: ${generated.toISOString()}`);
  console.log(`   Age: ${ageHours}h`);
  console.log(`   Source Hash: ${hashMatch[1]}`);
  console.log(`   API Gateway Port: ${portMatch[1]}`);

  if (ageHours > 24) {
    console.error(`❌ Config is ${ageHours}h old (exceeds 24h threshold)`);
    console.error('   Run: npm run generate:config');
    process.exit(1);
  }

  // Validate port is reasonable (between 3000-9000)
  const port = parseInt(portMatch[1]);
  if (port < 3000 || port > 9000) {
    console.error(`❌ Config shows invalid port ${port}!`);
    console.error('   Expected: Port between 3000-9000');
    console.error('   Run: npm run generate:config');
    process.exit(1);
  }

  console.log('✅ Config is fresh and valid');
  process.exit(0);
}

validateConfigFreshness();
