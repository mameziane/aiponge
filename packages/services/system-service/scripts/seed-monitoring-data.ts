#!/usr/bin/env tsx
/**
 * Monitoring Data Seeder
 *
 * Seeds initial health checks and alert rules using configuration from @aiponge/platform-core.
 * Eliminates hardcoded ports and URLs - all values derived from single source of truth.
 */

import { Pool } from 'pg';
import { SERVICES, getBackendServices, getInfrastructureServices } from '@aiponge/platform-core';

interface HealthCheckInsert {
  service_name: string;
  check_type: string;
  endpoint: string;
  interval_seconds: number;
  timeout_ms: number;
  metadata: string;
}

interface AlertRuleInsert {
  service_name: string;
  check_type: string;
  condition: string;
  threshold: number;
  severity: string;
  cooldown_minutes: number;
  escalation_minutes: number;
}

async function seedMonitoringData() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🌱 Seeding monitoring data from @aiponge/platform-core...\n');

    // Generate health checks from service configuration
    const healthChecks: HealthCheckInsert[] = [];

    // Add backend services
    const backendServices = getBackendServices();
    for (const service of backendServices) {
      const port = service.port?.development || service.port?.internal;
      healthChecks.push({
        service_name: service.name,
        check_type: 'http',
        endpoint: `http://localhost:${port}/health`,
        interval_seconds: 30,
        timeout_ms: 5000,
        metadata: JSON.stringify({ description: `${service.name} health check` }),
      });
    }

    // Add infrastructure services (api-gateway)
    const infrastructureServices = getInfrastructureServices();
    for (const service of infrastructureServices) {
      if (service.name === 'api-gateway') {
        const port = service.port?.development || service.port?.internal;
        healthChecks.push({
          service_name: service.name,
          check_type: 'http',
          endpoint: `http://localhost:${port}/health`,
          interval_seconds: 30,
          timeout_ms: 5000,
          metadata: JSON.stringify({ description: `${service.name} health check` }),
        });
      }
    }

    // Insert health checks
    console.log(`📊 Inserting ${healthChecks.length} health checks...`);
    for (const check of healthChecks) {
      try {
        await pool.query(
          `INSERT INTO health_checks (service_name, check_type, endpoint, interval_seconds, timeout_ms, metadata) 
           VALUES ($1, $2, $3, $4, $5, $6::jsonb)
           ON CONFLICT DO NOTHING`,
          [
            check.service_name,
            check.check_type,
            check.endpoint,
            check.interval_seconds,
            check.timeout_ms,
            check.metadata,
          ]
        );
        console.log(`   ✅ ${check.service_name}: ${check.endpoint}`);
      } catch (error) {
        console.error(`   ❌ Failed to insert health check for ${check.service_name}:`, error);
      }
    }

    // Generate alert rules
    const alertRules: AlertRuleInsert[] = [];

    // API Gateway - medium priority
    alertRules.push(
      {
        service_name: 'api-gateway',
        check_type: 'http',
        condition: 'response_time',
        threshold: 5000,
        severity: 'medium',
        cooldown_minutes: 5,
        escalation_minutes: 15,
      },
      {
        service_name: 'api-gateway',
        check_type: 'http',
        condition: 'consecutive_failures',
        threshold: 3,
        severity: 'high',
        cooldown_minutes: 5,
        escalation_minutes: 15,
      }
    );

    // User Profile Service
    alertRules.push(
      {
        service_name: 'user-service',
        check_type: 'http',
        condition: 'response_time',
        threshold: 5000,
        severity: 'medium',
        cooldown_minutes: 5,
        escalation_minutes: 15,
      },
      {
        service_name: 'user-service',
        check_type: 'http',
        condition: 'consecutive_failures',
        threshold: 3,
        severity: 'high',
        cooldown_minutes: 5,
        escalation_minutes: 15,
      }
    );

    // Critical services - higher priority
    const criticalServices = [
      'music-service',
      'ai-analysis-service',
      'ai-content-service',
      'ai-config-service',
      'storage-service',
      'system-service',
    ];

    for (const serviceName of criticalServices) {
      alertRules.push(
        {
          service_name: serviceName,
          check_type: 'http',
          condition: 'response_time',
          threshold: 5000,
          severity: 'medium',
          cooldown_minutes: 5,
          escalation_minutes: 15,
        },
        {
          service_name: serviceName,
          check_type: 'http',
          condition: 'consecutive_failures',
          threshold: 2,
          severity: 'critical',
          cooldown_minutes: 5,
          escalation_minutes: 15,
        }
      );
    }

    // Insert alert rules
    console.log(`\n🚨 Inserting ${alertRules.length} alert rules...`);
    for (const rule of alertRules) {
      try {
        await pool.query(
          `INSERT INTO alert_rules (service_name, check_type, condition, threshold, severity, cooldown_minutes, escalation_minutes) 
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [
            rule.service_name,
            rule.check_type,
            rule.condition,
            rule.threshold,
            rule.severity,
            rule.cooldown_minutes,
            rule.escalation_minutes,
          ]
        );
        console.log(`   ✅ ${rule.service_name}: ${rule.condition} (${rule.severity})`);
      } catch (error) {
        console.error(`   ❌ Failed to insert alert rule for ${rule.service_name}:`, error);
      }
    }

    console.log('\n✅ Monitoring data seeded successfully!');
    console.log(`   📊 Health checks: ${healthChecks.length}`);
    console.log(`   🚨 Alert rules: ${alertRules.length}`);
    console.log('   🎯 All ports derived from @aiponge/platform-core\n');
  } catch (error) {
    console.error('❌ Failed to seed monitoring data:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedMonitoringData();
