#!/usr/bin/env tsx
/**
 * Comprehensive Test Runner
 *
 * Orchestrates all tests in logical sequence:
 * 1. Unit tests (fast, isolated) - per service
 * 2. Contract tests (no services required) - type validation
 * 3. Integration tests (services required) - cross-service
 * 4. E2E tests (services required) - full user flows
 *
 * Usage:
 *   npx tsx tests/scripts/run-all-tests.ts [options]
 *
 * Options:
 *   --unit         Run only unit tests
 *   --integration  Run only integration tests
 *   --e2e          Run only E2E tests
 *   --contracts    Run only contract tests
 *   --quick        Run unit + contracts only (no services needed)
 *   --full         Run all tests (default)
 *   --verbose      Verbose output
 *   --help         Show help
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../..');
const TESTS_DIR = path.resolve(__dirname, '..');

interface TestResult {
  name: string;
  category: 'unit' | 'contract' | 'integration' | 'e2e';
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  message?: string;
}

const SERVICES = [
  'api-gateway',
  'user-service',
  'music-service',
  'ai-content-service',
  'ai-config-service',
  'ai-analytics-service',
  'storage-service',
  'system-service',
];

function runCommand(command: string, cwd: string, silent = false): { success: boolean; output: string } {
  try {
    const output = execSync(command, {
      cwd,
      stdio: silent ? 'pipe' : 'inherit',
      env: { ...process.env, NODE_ENV: 'test' },
      timeout: 180000,
    });
    return { success: true, output: output?.toString() || '' };
  } catch (error: any) {
    return {
      success: false,
      output: (error.stderr?.toString() || error.stdout?.toString() || error.message || '').slice(0, 300),
    };
  }
}

async function checkServicesRunning(): Promise<boolean> {
  try {
    execSync('curl -s http://localhost:8080/health', { timeout: 5000, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function runUnitTests(): TestResult[] {
  const results: TestResult[] = [];

  for (const service of SERVICES) {
    const servicePath = path.join(ROOT_DIR, 'packages/services', service);
    const unitTestPath = path.join(servicePath, 'src/tests/unit');
    const startTime = Date.now();

    if (!existsSync(servicePath)) {
      results.push({ name: service, category: 'unit', status: 'skipped', duration: 0, message: 'Not found' });
      continue;
    }

    let success = false;
    let output = '';

    if (existsSync(unitTestPath)) {
      const result = runCommand('npx vitest run src/tests/unit --passWithNoTests --reporter=dot', servicePath, true);
      success = result.success;
      output = result.output;
    } else {
      const result = runCommand('npx vitest run --passWithNoTests --reporter=dot', servicePath, true);
      success = result.success;
      output = result.output;
    }

    if (success || output.includes('No tests found') || output.includes('No test files found')) {
      const noTests = output.includes('No tests found') || output.includes('No test files found');
      results.push({
        name: service,
        category: 'unit',
        status: noTests ? 'skipped' : 'passed',
        duration: Date.now() - startTime,
      });
    } else {
      results.push({
        name: service,
        category: 'unit',
        status: 'failed',
        duration: Date.now() - startTime,
        message: output.split('\n')[0],
      });
    }
  }

  return results;
}

function runContractTests(): TestResult {
  const startTime = Date.now();
  const integrationDir = path.join(TESTS_DIR, 'integration');

  const { success, output } = runCommand(
    'npx vitest run contracts/shared-contracts --passWithNoTests --reporter=dot',
    integrationDir,
    true
  );

  return {
    name: 'shared-contracts',
    category: 'contract',
    status: success ? 'passed' : 'failed',
    duration: Date.now() - startTime,
    message: success ? undefined : output.split('\n')[0],
  };
}

function runIntegrationTests(): TestResult {
  const startTime = Date.now();
  const scriptPath = path.join(TESTS_DIR, 'scripts/run-integration.sh');

  const { success } = runCommand(`bash ${scriptPath}`, ROOT_DIR, false);

  return {
    name: 'integration-suite',
    category: 'integration',
    status: success ? 'passed' : 'failed',
    duration: Date.now() - startTime,
    message: success ? undefined : 'See output above',
  };
}

function runE2ETests(): TestResult {
  const startTime = Date.now();
  const e2eDir = path.join(TESTS_DIR, 'e2e');

  const { success } = runCommand('npx vitest run --passWithNoTests --reporter=dot', e2eDir, false);

  return {
    name: 'e2e-suite',
    category: 'e2e',
    status: success ? 'passed' : 'failed',
    duration: Date.now() - startTime,
    message: success ? undefined : 'See output above',
  };
}

function printHeader(text: string): void {
  console.log('');
  console.log('═'.repeat(70));
  console.log(`  ${text}`);
  console.log('═'.repeat(70));
}

function printResult(result: TestResult, indent = '  '): void {
  const duration = result.duration > 0 ? `(${(result.duration / 1000).toFixed(1)}s)` : '';
  const icon = result.status === 'passed' ? '✅' : result.status === 'skipped' ? '⏭️' : '❌';
  console.log(`${indent}${icon} ${result.name} ${duration}`);
  if (result.message && result.status === 'failed') {
    console.log(`${indent}   └─ ${result.message}`);
  }
}

function printUsage(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║  AIPONGE TEST RUNNER                                                         ║
╚══════════════════════════════════════════════════════════════════════════════╝

Usage: npx tsx tests/scripts/run-all-tests.ts [options]

Test Categories:
  --unit         Service unit tests (fast, isolated)
  --contracts    Contract validation tests (no services needed)
  --integration  Cross-service integration tests
  --e2e          End-to-end user flow tests

Presets:
  --quick        Unit + contracts only (no services needed)
  --full         All tests (default)

Options:
  --verbose, -v  Verbose output
  --help, -h     Show this help

Examples:
  npx tsx tests/scripts/run-all-tests.ts              # Run all tests
  npx tsx tests/scripts/run-all-tests.ts --quick      # Fast tests only
  npx tsx tests/scripts/run-all-tests.ts --unit       # Unit tests only
  npx tsx tests/scripts/run-all-tests.ts --e2e        # E2E tests only
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const onlyUnit = args.includes('--unit');
  const onlyContracts = args.includes('--contracts');
  const onlyIntegration = args.includes('--integration');
  const onlyE2E = args.includes('--e2e');
  const quick = args.includes('--quick');
  const hasSpecificFlag = onlyUnit || onlyContracts || onlyIntegration || onlyE2E || quick;

  const runUnit = onlyUnit || quick || !hasSpecificFlag;
  const runContracts = onlyContracts || quick || !hasSpecificFlag;
  const runIntegration = onlyIntegration || (!hasSpecificFlag && !quick);
  const runE2E = onlyE2E || (!hasSpecificFlag && !quick);
  const needsServices = runIntegration || runE2E;

  console.log('');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + '  AIPONGE TEST SUITE'.padEnd(68) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  const results: TestResult[] = [];
  let servicesAvailable = false;

  if (needsServices) {
    servicesAvailable = await checkServicesRunning();
    console.log('');
    if (servicesAvailable) {
      console.log('✅ Backend services running');
    } else {
      console.log('⚠️  Backend services not running');
      console.log('   Integration and E2E tests will be skipped');
    }
  }

  if (runUnit) {
    printHeader('UNIT TESTS');
    console.log('  Running service unit tests...\n');
    const unitResults = runUnitTests();
    unitResults.forEach(r => printResult(r));
    results.push(...unitResults);
  }

  if (runContracts) {
    printHeader('CONTRACT TESTS');
    console.log('  Running type contract validation...\n');
    const contractResult = runContractTests();
    printResult(contractResult);
    results.push(contractResult);
  }

  if (runIntegration) {
    printHeader('INTEGRATION TESTS');
    if (!servicesAvailable) {
      console.log('  ⏭️  Skipped - services not running\n');
      results.push({
        name: 'integration-suite',
        category: 'integration',
        status: 'skipped',
        duration: 0,
        message: 'Services not running',
      });
    } else {
      console.log('  Running cross-service tests...\n');
      const integrationResult = runIntegrationTests();
      if (integrationResult.status !== 'passed') printResult(integrationResult);
      results.push(integrationResult);
    }
  }

  if (runE2E) {
    printHeader('E2E TESTS');
    if (!servicesAvailable) {
      console.log('  ⏭️  Skipped - services not running\n');
      results.push({
        name: 'e2e-suite',
        category: 'e2e',
        status: 'skipped',
        duration: 0,
        message: 'Services not running',
      });
    } else {
      console.log('  Running end-to-end flows...\n');
      const e2eResult = runE2ETests();
      if (e2eResult.status !== 'passed') printResult(e2eResult);
      results.push(e2eResult);
    }
  }

  printHeader('SUMMARY');

  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log('');
  console.log(`  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  ⏱️  Duration: ${(totalDuration / 1000).toFixed(1)}s`);
  console.log('');

  if (failed > 0) {
    console.log('❌ TESTS FAILED\n');
    results.filter(r => r.status === 'failed').forEach(r => console.log(`  • ${r.name}: ${r.message || 'Failed'}`));
    console.log('');
    process.exit(1);
  } else {
    console.log('✅ ALL TESTS PASSED\n');
    process.exit(0);
  }
}

main().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
