#!/usr/bin/env npx tsx
/**
 * Port Environment Generator
 * 
 * Generates .env.ports from services.config.ts to ensure single source of truth.
 * This file is sourced by start-dev.sh before starting services.
 * 
 * Usage: npx tsx scripts/generate-port-env.ts
 */

import { writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Import services config
import { SERVICES, getBackendServices } from '../../packages/platform-core/src/config/services-definition';

function generatePortEnv(): void {
  const backendServices = getBackendServices();
  
  const lines: string[] = [
    '# AUTO-GENERATED - DO NOT EDIT',
    '# Generated from packages/platform-core/src/config/services-definition.ts',
    `# Generated at: ${new Date().toISOString()}`,
    '#',
    '# This file is sourced by start-dev.sh to ensure consistent port configuration.',
    '# To regenerate: npx tsx scripts/generate-port-env.ts',
    '',
    '# Service Port Configuration',
    '# Only api-gateway should use PORT (Replit sets this to 8080)',
    '# All other services use their specific *_SERVICE_PORT variables',
    '',
  ];

  for (const service of backendServices) {
    const envVarName = `${service.name.toUpperCase().replace(/-/g, '_')}_PORT`;
    const port = service.port.development || service.port.internal;
    lines.push(`export ${envVarName}=${port}`);
  }

  lines.push('');
  lines.push('# Port validation complete');
  lines.push(`# Total services configured: ${backendServices.length}`);
  lines.push('');

  const outputPath = resolve(rootDir, '.env.ports');
  writeFileSync(outputPath, lines.join('\n'));
  
  console.log(`✅ Generated ${outputPath}`);
  console.log(`   Configured ${backendServices.length} services:`);
  for (const service of backendServices) {
    const port = service.port.development || service.port.internal;
    console.log(`   - ${service.name}: ${port}`);
  }
}

// Run generator
generatePortEnv();
