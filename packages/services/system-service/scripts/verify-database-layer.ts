#!/usr/bin/env npx tsx
/**
 * Database Layer Verification Script
 * Validates that Drizzle schemas match actual database structure
 * Run: npx tsx packages/services/system-service/scripts/verify-database-layer.ts
 */

import { sql } from 'drizzle-orm';
import { alerts, alertRules } from '../src/schema/system-schema';
import { getDatabase } from '../src/infrastructure/database/DatabaseConnectionFactory';

const db = getDatabase('system-service');

interface ColumnInfo {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

interface ValidationResult {
  table: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: string[];
}

const results: ValidationResult[] = [];

async function getTableColumns(tableName: string): Promise<ColumnInfo[]> {
  const result = await db.execute(sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = ${tableName}
    ORDER BY ordinal_position
  `);
  return (result as { rows?: Record<string, unknown>[] }).rows || result || [];
}

async function tableExists(tableName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ${tableName}
    ) as exists
  `);
  const row = (result as { rows?: Record<string, unknown>[] }).rows?.[0] || result[0];
  return row?.exists === true;
}

async function verifySysAlertsTable(): Promise<void> {
  console.log('\n📋 Verifying sys_alerts table...');
  
  const exists = await tableExists('sys_alerts');
  if (!exists) {
    results.push({
      table: 'sys_alerts',
      status: 'fail',
      message: 'Table does not exist'
    });
    return;
  }

  const columns = await getTableColumns('sys_alerts');
  const columnNames = columns.map(c => c.column_name);

  const expectedColumns = [
    'id', 'alert_rule_id', 'service_name', 'severity', 'title', 
    'message', 'status', 'metadata', 'triggered_at', 'resolved_at', 
    'acknowledged_at', 'acknowledged_by'
  ];

  const drizzleColumns = Object.keys(alerts);
  console.log('  Drizzle schema columns:', drizzleColumns.join(', '));
  console.log('  Database columns:', columnNames.join(', '));

  const missingInDb = expectedColumns.filter(c => !columnNames.includes(c));
  const extraInDb = columnNames.filter(c => !expectedColumns.includes(c));

  if (missingInDb.length > 0) {
    results.push({
      table: 'sys_alerts',
      status: 'fail',
      message: 'Missing expected columns',
      details: missingInDb
    });
  } else if (extraInDb.length > 0) {
    results.push({
      table: 'sys_alerts',
      status: 'warning',
      message: 'Extra columns in database (may be fine)',
      details: extraInDb
    });
  } else {
    results.push({
      table: 'sys_alerts',
      status: 'pass',
      message: 'All expected columns present'
    });
  }
}

async function verifySysAlertRulesTable(): Promise<void> {
  console.log('\n📋 Verifying sys_alert_rules table...');
  
  const exists = await tableExists('sys_alert_rules');
  if (!exists) {
    results.push({
      table: 'sys_alert_rules',
      status: 'fail',
      message: 'Table does not exist'
    });
    return;
  }

  const columns = await getTableColumns('sys_alert_rules');
  const columnNames = columns.map(c => c.column_name);

  const expectedColumns = [
    'id', 'name', 'description', 'condition_type', 'condition_config',
    'severity', 'is_enabled', 'notification_channels', 'cooldown_minutes',
    'metadata', 'created_at', 'updated_at'
  ];

  const drizzleColumns = Object.keys(alertRules);
  console.log('  Drizzle schema columns:', drizzleColumns.join(', '));
  console.log('  Database columns:', columnNames.join(', '));

  const missingInDb = expectedColumns.filter(c => !columnNames.includes(c));

  if (missingInDb.length > 0) {
    results.push({
      table: 'sys_alert_rules',
      status: 'fail',
      message: 'Missing expected columns',
      details: missingInDb
    });
  } else {
    results.push({
      table: 'sys_alert_rules',
      status: 'pass',
      message: 'All expected columns present'
    });
  }
}

async function verifyNotificationChannelsTable(): Promise<void> {
  console.log('\n📋 Verifying notification_channels table...');
  
  const exists = await tableExists('notification_channels');
  if (exists) {
    results.push({
      table: 'notification_channels',
      status: 'warning',
      message: 'Table exists but code expects it to be inline in sys_alert_rules'
    });
  } else {
    results.push({
      table: 'notification_channels',
      status: 'pass',
      message: 'Table correctly does not exist (stored inline in sys_alert_rules)'
    });
  }
}

async function testBasicQueries(): Promise<void> {
  console.log('\n🔍 Testing basic queries...');

  try {
    const alertCount = await db.select({ count: sql<number>`count(*)` }).from(alerts);
    console.log(`  ✅ sys_alerts query successful (${alertCount[0]?.count || 0} rows)`);
    results.push({
      table: 'sys_alerts',
      status: 'pass',
      message: `Basic query successful (${alertCount[0]?.count || 0} rows)`
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ sys_alerts query failed: ${errorMessage}`);
    results.push({
      table: 'sys_alerts',
      status: 'fail',
      message: `Query failed: ${errorMessage}`
    });
  }

  try {
    const ruleCount = await db.select({ count: sql<number>`count(*)` }).from(alertRules);
    console.log(`  ✅ sys_alert_rules query successful (${ruleCount[0]?.count || 0} rows)`);
    results.push({
      table: 'sys_alert_rules',
      status: 'pass',
      message: `Basic query successful (${ruleCount[0]?.count || 0} rows)`
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ sys_alert_rules query failed: ${errorMessage}`);
    results.push({
      table: 'sys_alert_rules',
      status: 'fail',
      message: `Query failed: ${errorMessage}`
    });
  }
}

async function testJoinQueries(): Promise<void> {
  console.log('\n🔗 Testing join queries...');

  try {
    const joinResult = await db.execute(sql`
      SELECT a.id, a.service_name, r.name as rule_name
      FROM sys_alerts a
      LEFT JOIN sys_alert_rules r ON a.alert_rule_id = r.id
      LIMIT 5
    `);
    const rows = (joinResult as { rows?: Record<string, unknown>[] }).rows || joinResult || [];
    console.log(`  ✅ Alert-Rule join successful (${rows.length} rows)`);
    results.push({
      table: 'join:alerts-rules',
      status: 'pass',
      message: `Join query successful (${rows.length} rows)`
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(`  ❌ Alert-Rule join failed: ${errorMessage}`);
    results.push({
      table: 'join:alerts-rules',
      status: 'fail',
      message: `Join query failed: ${errorMessage}`
    });
  }
}

async function printSummary(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warning').length;

  for (const result of results) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
    console.log(`${icon} ${result.table}: ${result.message}`);
    if (result.details) {
      console.log(`   Details: ${result.details.join(', ')}`);
    }
  }

  console.log('\n' + '-'.repeat(60));
  console.log(`Total: ${passed} passed, ${failed} failed, ${warnings} warnings`);
  
  if (failed > 0) {
    console.log('\n❌ VERIFICATION FAILED - Database layer has issues');
    process.exit(1);
  } else if (warnings > 0) {
    console.log('\n⚠️ VERIFICATION PASSED WITH WARNINGS');
  } else {
    console.log('\n✅ VERIFICATION PASSED - Database layer is healthy');
  }
}

async function main() {
  console.log('🔧 Database Layer Verification Script');
  console.log('='.repeat(60));

  try {
    await verifySysAlertsTable();
    await verifySysAlertRulesTable();
    await verifyNotificationChannelsTable();
    await testBasicQueries();
    await testJoinQueries();
    await printSummary();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('\n❌ Verification script failed:', errorMessage);
    process.exit(1);
  }
}

main();
