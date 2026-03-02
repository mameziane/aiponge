#!/usr/bin/env tsx
/**
 * Generate Expo-Safe Service Configuration
 *
 * Reads from services.config.ts and extracts API Gateway configuration
 * to generate a lightweight config for React Native/Expo apps.
 *
 * This script is standalone and doesn't import from packages to avoid build dependencies.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { createHash } from 'crypto';

interface ExpoServiceConfig {
  apiGatewayUrl: string;
  apiGatewayPort: number;
  environment: 'development' | 'production';
  generated: string;
  sourceHash: string;
}

function getSourceHash(): string {
  const sourcePath = resolve(__dirname, '../../packages/platform-core/src/config/services-definition.ts');
  const source = readFileSync(sourcePath, 'utf-8');
  return createHash('md5').update(source).digest('hex').slice(0, 8);
}

function extractApiGatewayPort(): number {
  const sourcePath = resolve(__dirname, '../../packages/platform-core/src/config/services-definition.ts');
  const source = readFileSync(sourcePath, 'utf-8');

  // Find the api-gateway service definition
  const apiGatewayMatch = source.match(/{\s*name:\s*['"]api-gateway['"][\s\S]*?port:\s*{\s*[^}]*internal:\s*(\d+)/);

  if (!apiGatewayMatch) {
    throw new Error('Could not find api-gateway port in services.config.ts');
  }

  return parseInt(apiGatewayMatch[1], 10);
}

function generateServiceConfig(): ExpoServiceConfig {
  const environment = process.env.NODE_ENV === 'production' ? 'production' : 'development';
  const apiGatewayPort = extractApiGatewayPort();

  const apiGatewayUrl = process.env.EXPO_PUBLIC_API_URL || `http://localhost:${apiGatewayPort}`;

  return {
    apiGatewayUrl,
    apiGatewayPort,
    environment,
    generated: new Date().toISOString(),
    sourceHash: getSourceHash(),
  };
}

function showConfigDiff(outputPath: string, newConfig: ExpoServiceConfig): void {
  if (!existsSync(outputPath)) {
    console.log('📝 Creating new config file');
    return;
  }

  try {
    const oldContent = readFileSync(outputPath, 'utf-8');
    const oldPort = oldContent.match(/apiGatewayPort: (\d+)/)?.[1];
    const newPort = String(newConfig.apiGatewayPort);

    if (oldPort !== newPort) {
      console.log(`📊 Port change detected: ${oldPort} → ${newPort}`);
    }

    const oldHash = oldContent.match(/sourceHash: "([^"]+)"/)?.[1];
    const newHash = newConfig.sourceHash;

    if (oldHash !== newHash) {
      console.log(`🔄 Source hash changed: ${oldHash || 'none'} → ${newHash}`);
    }
  } catch (err) {
    // Ignore diff errors
  }
}

function writeConfigWithRetry(config: ExpoServiceConfig, outputPath: string, retries = 3): void {
  const dir = dirname(outputPath);

  for (let i = 0; i < retries; i++) {
    try {
      mkdirSync(dir, { recursive: true });

      // Show what's changing
      showConfigDiff(outputPath, config);

      // Generate content with runtime validation
      const content = `// AUTO-GENERATED - DO NOT EDIT
// Generated from packages/platform-core/src/config/services-definition.ts
// Run 'npm run generate:config' to regenerate

export const CONFIG_METADATA = {
  generated: "${config.generated}",
  sourceHash: "${config.sourceHash}",
  version: "1.0.0"
} as const;

export const SERVICE_CONFIG = {
  apiGatewayUrl: "${config.apiGatewayUrl}",
  apiGatewayPort: ${config.apiGatewayPort},
  environment: "${config.environment}"
} as const;

export interface ServiceEndpoint {
  url: string;
  port: number;
  health: string;
}

export interface ServiceEndpoints {
  apiGateway: ServiceEndpoint;
}

export const endpoints: ServiceEndpoints = {
  apiGateway: {
    url: '${config.apiGatewayUrl}',
    port: ${config.apiGatewayPort},
    health: '${config.apiGatewayUrl}/health'
  }
} as const;

// Type-safe getter with validation and runtime environment detection
export function getApiGatewayUrl(): string {
  validateConfig();
  
  // 1. Production override (explicit environment variable)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  // 2. Browser/Frontend: use configured gateway URL
  if (typeof window !== 'undefined') {
    return endpoints.apiGateway.url;
  }
  
  // 3. Server/Node: use localhost for internal calls
  return 'http://localhost:8080';
}

// Runtime validation
export function validateConfig() {
  const MAX_AGE_HOURS = 24;
  const age = Date.now() - new Date(CONFIG_METADATA.generated).getTime();
  
  if (age > MAX_AGE_HOURS * 60 * 60 * 1000) {
    const ageHours = Math.round(age / (60 * 60 * 1000));
    console.error(
      \`❌ CRITICAL: Service config is \${ageHours}h old!\\n\` +
      \`   Generated: \${CONFIG_METADATA.generated}\\n\` +
      \`   Run: npm run generate:config\\n\` +
      \`   Or: npm install (triggers postinstall)\\n\`
    );
    
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Stale configuration detected in production!');
    }
  }
  
  // Development: Check if source has changed since generation
  if (process.env.NODE_ENV === 'development') {
    try {
      const fs = require('fs');
      const crypto = require('crypto');
      const path = require('path');
      
      const sourcePath = path.resolve(process.cwd(), 'packages/platform-core/src/config/services-definition.ts');
      if (fs.existsSync(sourcePath)) {
        const currentSource = fs.readFileSync(sourcePath, 'utf-8');
        const currentSourceHash = crypto.createHash('md5').update(currentSource).digest('hex').slice(0, 8);
        
        if (currentSourceHash !== CONFIG_METADATA.sourceHash) {
          console.warn(
            \`⚠️  WARNING: services.config.ts has changed!\\n\` +
            \`   Current hash: \${currentSourceHash}\\n\` +
            \`   Config hash: \${CONFIG_METADATA.sourceHash}\\n\` +
            \`   Run: npm run generate:config\\n\`
          );
        }
      }
    } catch (err) {
      // Silently ignore in environments where fs isn't available (React Native)
    }
  }
}

// Auto-validate on import (non-test environments)
if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'test') {
  validateConfig();
}
`;

      writeFileSync(outputPath, content, 'utf-8');
      console.log(`✅ Generated: ${outputPath}`);
      return;
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`⚠️  Retry ${i + 1}/${retries}: ${error.message}`);
      // Exponential backoff
      const delay = Math.pow(2, i) * 100;
      const start = Date.now();
      while (Date.now() - start < delay) {}
    }
  }
}

async function main() {
  try {
    const config = generateServiceConfig();
    const outputPath = resolve(__dirname, '../../apps/aiponge/config/generated/service-config.ts');

    writeConfigWithRetry(config, outputPath);

    console.log('✅ Service config generated successfully');
    console.log(`   API Gateway: ${config.apiGatewayUrl}`);
    console.log(`   Port: ${config.apiGatewayPort}`);
    console.log(`   Environment: ${config.environment}`);
    console.log(`   Source Hash: ${config.sourceHash}`);
    console.log(`   Timestamp: ${config.generated}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to generate service config:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack: ${error.stack?.split('\n')[1]?.trim() || 'unknown'}`);
    console.error('   This will cause frontend to fail!');

    if (process.env.CI === 'true') {
      console.error('   Failing CI build...');
      process.exit(1);
    } else {
      console.warn('   Continuing in dev mode, but fix this ASAP!');
      process.exit(0);
    }
  }
}

// Watch mode support
if (process.argv.includes('--watch')) {
  (async () => {
    const chokidar = await import('chokidar');
    console.log('👀 Watching for config changes...');

    const watcher = chokidar.watch(
      'packages/platform-core/src/config/services-definition.ts',
      { ignoreInitial: true } // Quieter - don't trigger on startup
    );

    watcher.on('change', path => {
      console.log(`🔄 ${path} changed, regenerating...`);
      main();
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n👋 Stopping config watcher...');
      watcher.close();
      process.exit(0);
    });

    // Initial generation
    await main();
  })();
} else {
  main();
}
