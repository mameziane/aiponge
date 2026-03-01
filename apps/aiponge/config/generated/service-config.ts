// AUTO-GENERATED - DO NOT EDIT
// Generated from packages/platform-core/src/config/services-definition.ts
// Run 'npm run generate:config' to regenerate

export const CONFIG_METADATA = {
  generated: "2026-03-01T10:16:14.322Z",
  sourceHash: "9095217d",
  version: "1.0.0"
} as const;

export const SERVICE_CONFIG = {
  apiGatewayUrl: "http://localhost:8080",
  apiGatewayPort: 8080,
  environment: "development"
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
    url: 'http://localhost:8080',
    port: 8080,
    health: 'http://localhost:8080/health'
  }
} as const;

// Type-safe getter with validation and runtime environment detection
export function getApiGatewayUrl(): string {
  validateConfig();
  
  // 1. Production override (explicit environment variable)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  
  // 2. Browser/Frontend: use Replit dev URL (browsers can't access localhost from Replit preview)
  if (typeof window !== 'undefined') {
    return endpoints.apiGateway.url; // https://xxx.replit.dev:8080
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
      `❌ CRITICAL: Service config is ${ageHours}h old!\n` +
      `   Generated: ${CONFIG_METADATA.generated}\n` +
      `   Run: npm run generate:config\n` +
      `   Or: npm install (triggers postinstall)\n`
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
            `⚠️  WARNING: services.config.ts has changed!\n` +
            `   Current hash: ${currentSourceHash}\n` +
            `   Config hash: ${CONFIG_METADATA.sourceHash}\n` +
            `   Run: npm run generate:config\n`
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
