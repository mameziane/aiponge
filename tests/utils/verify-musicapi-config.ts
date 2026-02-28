/**
 * Verification Script: MusicAPI.ai Provider Configuration
 * 
 * This script ensures the MusicAPI.ai provider is properly configured to:
 * 1. Accept user-generated lyrics via the prompt parameter
 * 2. Use custom_mode=true for lyric-based generation
 * 3. Use free health checks to avoid wasting API credits
 * 
 * Run: npx tsx scripts/verify-musicapi-config.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and } from 'drizzle-orm';
import pkg from 'pg';
const { Pool } = pkg;

// Import schema
import { providerConfigurations } from '../packages/services/ai-config-service/src/shared/database/schema';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
});

const db = drizzle(pool);

// Expected MusicAPI.ai configuration (based on official API spec)
const EXPECTED_CONFIG = {
  endpoint: 'https://api.musicapi.ai/api/v1/sonic/create',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer {{MUSICAPI_API_KEY}}',
  },
  requestTemplate: {
    // NO task_type field - it doesn't exist in MusicAPI.ai API!
    custom_mode: true,
    prompt: '{{prompt}}',
    title: '{{title}}',
    mv: 'sonic-v5',
    tags: '{{style}}',
    make_instrumental: false,
  },
  responseMapping: {
    content: 'task_id',
    audioUrl: 'audio_url',
    lyrics: 'lyrics',
  },
  timeout: 300000, // 5 minutes
  healthEndpoint: {
    url: 'https://api.musicapi.ai/api/v1/sonic/get?task_id=health_check',
    method: 'GET',
    requiresAuth: false,
    isFree: true, // CRITICAL: Prevents credit waste on health checks
  },
};

async function verifyMusicApiConfig() {
  console.log('🔍 Verifying MusicAPI.ai provider configuration...\n');

  try {
    // Check if MusicAPI.ai provider exists
    const providers = await db
      .select()
      .from(providerConfigurations)
      .where(
        and(
          eq(providerConfigurations.providerName, 'musicapi'),
          eq(providerConfigurations.isActive, true)
        )
      );

    if (providers.length === 0) {
      console.error('❌ MusicAPI.ai provider not found in database');
      console.log('\n📝 To add MusicAPI.ai provider, run:');
      console.log('   npx tsx scripts/seed-musicapi-provider.ts');
      return false;
    }

    const provider = providers[0];
    console.log(`✅ Found MusicAPI.ai provider (ID: ${provider.providerId})\n`);

    // Parse configuration
    let config: any;
    try {
      config = typeof provider.configuration === 'string' 
        ? JSON.parse(provider.configuration) 
        : provider.configuration;
    } catch (error) {
      console.error('❌ Failed to parse provider configuration JSON');
      return false;
    }

    // Verify critical fields
    const issues: string[] = [];
    
    // 1. Ensure NO task_type field (doesn't exist in MusicAPI.ai API)
    if (config.requestTemplate?.task_type) {
      issues.push('❌ Invalid field task_type found - remove it (not part of MusicAPI.ai API)');
    } else {
      console.log('✅ No task_type field (correct - not part of API spec)');
    }

    // 2. Check custom_mode parameter
    if (!config.requestTemplate?.custom_mode) {
      issues.push('❌ Missing custom_mode=true in requestTemplate (required for lyrics)');
    } else {
      console.log('✅ custom_mode: true (lyrics-based generation enabled)');
    }

    // 3. Check prompt parameter
    if (config.requestTemplate?.prompt !== '{{prompt}}') {
      issues.push('❌ prompt parameter missing or incorrect (should be "{{prompt}}")');
    } else {
      console.log('✅ prompt: "{{prompt}}" (user lyrics will be passed)');
    }

    // 4. Check title parameter
    if (config.requestTemplate?.title !== '{{title}}') {
      issues.push('❌ title parameter missing or incorrect (should be "{{title}}")');
    } else {
      console.log('✅ title: "{{title}}" (song title will be passed)');
    }

    // 5. Check make_instrumental parameter
    if (config.requestTemplate?.make_instrumental !== false) {
      issues.push('⚠️  make_instrumental not set to false (may generate instrumental-only tracks)');
    } else {
      console.log('✅ make_instrumental: false (vocal tracks enabled)');
    }

    // 6. Check model version
    if (config.requestTemplate?.mv) {
      console.log(`✅ mv: "${config.requestTemplate.mv}" (model version set)`);
    } else {
      issues.push('⚠️  Missing mv parameter (model version)');
    }

    // 7. Check response mapping for audio_url
    if (config.responseMapping?.audioUrl !== 'audio_url') {
      issues.push('❌ Response mapping incorrect: audioUrl should map to "audio_url" (not "download_url")');
    } else {
      console.log('✅ responseMapping.audioUrl: "audio_url" (correct field name)');
    }

    // 8. Check health endpoint
    if (!config.healthEndpoint) {
      issues.push('❌ Missing healthEndpoint configuration');
    } else {
      console.log(`✅ healthEndpoint.url: "${config.healthEndpoint.url}"`);
      
      if (!config.healthEndpoint.isFree) {
        issues.push('🚨 CRITICAL: healthEndpoint.isFree is not true - HEALTH CHECKS WILL WASTE API CREDITS!');
      } else {
        console.log('✅ healthEndpoint.isFree: true (no credit waste on health checks)');
      }

      if (config.healthEndpoint.requiresAuth) {
        issues.push('⚠️  healthEndpoint.requiresAuth is true (may cause health check failures)');
      } else {
        console.log('✅ healthEndpoint.requiresAuth: false (health checks work without auth)');
      }
    }

    // 9. Check timeout
    if (config.timeout && config.timeout < 120000) {
      issues.push(`⚠️  Timeout too short: ${config.timeout}ms (music generation can take 2-5 minutes)`);
    } else {
      console.log(`✅ timeout: ${config.timeout || 'default'}ms (sufficient for music generation)`);
    }

    // 10. Verify endpoint
    if (config.endpoint !== EXPECTED_CONFIG.endpoint) {
      issues.push(`❌ Wrong endpoint: ${config.endpoint} (should be ${EXPECTED_CONFIG.endpoint})`);
    } else {
      console.log(`✅ endpoint: "${config.endpoint}"`);
    }

    // Print results
    console.log('\n' + '='.repeat(60));
    if (issues.length === 0) {
      console.log('✅ All checks passed! MusicAPI.ai is correctly configured.');
      console.log('\n📋 Configuration Summary:');
      console.log('   • Endpoint: /api/v1/sonic/create (correct Sonic API endpoint)');
      console.log('   • NO task_type field (correct - not part of API spec)');
      console.log('   • Lyrics will be passed via prompt parameter');
      console.log('   • Song titles will be passed via title parameter');
      console.log('   • custom_mode=true enables lyric-based generation');
      console.log('   • make_instrumental=false enables vocal tracks');
      console.log('   • tags parameter maps style for genre classification');
      console.log('   • Response maps audio_url correctly (not download_url)');
      console.log('   • Health checks use free endpoint (no credit waste)');
      console.log('   • Polling endpoint: /api/v1/sonic/get');
      console.log('   • Model version: ' + (config.requestTemplate?.mv || 'default'));
      return true;
    } else {
      console.log('❌ Configuration Issues Found:\n');
      issues.forEach(issue => console.log(`   ${issue}`));
      console.log('\n💡 Run update script to fix issues:');
      console.log('   npx tsx scripts/update-musicapi-config.ts');
      return false;
    }

  } catch (error) {
    console.error('❌ Error verifying configuration:', error);
    return false;
  } finally {
    await pool.end();
  }
}

// Run verification
verifyMusicApiConfig()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
