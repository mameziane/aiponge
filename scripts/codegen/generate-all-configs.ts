#!/usr/bin/env tsx
/**
 * Master Configuration Generator
 * 
 * Orchestrates all config generation from the single source of truth:
 * packages/platform-core/src/config/services-definition.ts
 * 
 * This ensures all configuration files stay in perfect sync.
 */

import { execSync } from 'child_process';
import { resolve } from 'path';

const generators = [
  {
    name: 'Service Manifest (Backend)',
    script: 'packages/services/system-service/scripts/generate-service-manifest.ts',
    description: 'Generates service-manifest.cjs for backend services',
  },
  {
    name: 'Service Config (Frontend)',
    script: 'scripts/codegen/generate-service-config.ts',
    description: 'Generates service-config.ts for Expo/React Native apps',
  },
];

function runGenerator(generator: typeof generators[0]) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔧 ${generator.name}`);
  console.log(`   ${generator.description}`);
  console.log('='.repeat(60));

  try {
    const projectRoot = resolve(__dirname, '../..');
    const scriptPath = resolve(projectRoot, generator.script);
    execSync(`tsx ${scriptPath}`, { 
      stdio: 'inherit',
      cwd: projectRoot,
    });
    console.log(`✅ ${generator.name} completed`);
    return true;
  } catch (error) {
    console.error(`❌ ${generator.name} failed:`, (error as Error).message);
    return false;
  }
}

function main() {
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log('║' + ' '.repeat(10) + 'PORT CONFIGURATION AUTO-GENERATION' + ' '.repeat(13) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log('\n📍 Source: packages/platform-core/src/config/services-definition.ts\n');

  const results = generators.map(runGenerator);
  const failures = results.filter(r => !r).length;

  console.log('\n' + '='.repeat(60));
  if (failures === 0) {
    console.log('✅ ALL CONFIGURATIONS GENERATED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log('   ✓ Backend services: service-manifest.cjs');
    console.log('   ✓ Frontend apps: service-config.ts');
    console.log('   ℹ Microservices: service-urls.ts (static, no codegen needed)');
    console.log('\n📁 Docker files are manually maintained:');
    console.log('   • deploy/docker/docker-compose.common.yml (shared base)');
    console.log('   • deploy/docker/docker-compose.yml (dev overlay)');
    console.log('   • deploy/docker/docker-compose.prod.yml (prod overlay)');
    console.log('\n⚠️  Note: .replit cannot be auto-generated (Replit security restriction)');
    console.log('\n🎯 Single Source of Truth maintained!');
    process.exit(0);
  } else {
    console.log(`❌ ${failures} GENERATOR(S) FAILED`);
    console.log('='.repeat(60));
    console.error('\n⚠️  Some configurations may be out of sync!');
    process.exit(1);
  }
}

main();
