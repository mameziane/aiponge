/**
 * Live API Contract Validator
 * 
 * Utilities for validating actual API responses against Zod schemas.
 * This catches frontend-backend mismatches before they reach production.
 */

import { ZodSchema, ZodError } from 'zod';
import { makeRequest, SERVICE_URLS, TIMEOUTS } from './test-setup';

export interface ContractValidationResult {
  endpoint: string;
  method: string;
  status: 'pass' | 'fail' | 'skip';
  responseStatus?: number;
  validationErrors?: string[];
  duration: number;
  error?: string;
}

export interface ContractTestConfig {
  endpoint: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  schema: ZodSchema;
  body?: unknown;
  headers?: Record<string, string>;
  description?: string;
  skipIf?: () => boolean;
  expectedStatus?: number;
}

export class ContractValidator {
  private results: ContractValidationResult[] = [];
  private baseUrl: string;

  constructor(baseUrl: string = SERVICE_URLS.API_GATEWAY) {
    this.baseUrl = baseUrl;
  }

  async validateEndpoint(config: ContractTestConfig): Promise<ContractValidationResult> {
    const startTime = Date.now();
    const fullUrl = `${this.baseUrl}${config.endpoint}`;

    if (config.skipIf?.()) {
      const result: ContractValidationResult = {
        endpoint: config.endpoint,
        method: config.method,
        status: 'skip',
        duration: 0,
      };
      this.results.push(result);
      return result;
    }

    try {
      const response = await makeRequest(
        fullUrl,
        {
          method: config.method,
          body: config.body ? JSON.stringify(config.body) : undefined,
          headers: config.headers,
        },
        TIMEOUTS.REQUEST
      );

      const duration = Date.now() - startTime;

      const parseResult = config.schema.safeParse(response);

      if (parseResult.success) {
        const result: ContractValidationResult = {
          endpoint: config.endpoint,
          method: config.method,
          status: 'pass',
          responseStatus: response.status,
          duration,
        };
        this.results.push(result);
        console.log(`✅ ${config.method} ${config.endpoint} - Contract valid (${duration}ms)`);
        return result;
      } else {
        const validationErrors = this.formatZodErrors(parseResult.error);
        const result: ContractValidationResult = {
          endpoint: config.endpoint,
          method: config.method,
          status: 'fail',
          responseStatus: response.status,
          validationErrors,
          duration,
        };
        this.results.push(result);
        console.error(`❌ ${config.method} ${config.endpoint} - Contract violation:`, validationErrors);
        return result;
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
        const errorWithCause = error as Error & { cause?: { code?: string } };
        if (errorWithCause.cause?.code) {
          errorMessage = `${error.message} (${errorWithCause.cause.code})`;
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      const result: ContractValidationResult = {
        endpoint: config.endpoint,
        method: config.method,
        status: 'fail',
        duration,
        error: errorMessage,
      };
      this.results.push(result);
      console.warn(`⚠️ ${config.method} ${config.endpoint} - Request failed: ${result.error}`);
      return result;
    }
  }

  async validateMany(configs: ContractTestConfig[]): Promise<ContractValidationResult[]> {
    const results: ContractValidationResult[] = [];
    for (const config of configs) {
      const result = await this.validateEndpoint(config);
      results.push(result);
    }
    return results;
  }

  private formatZodErrors(error: ZodError): string[] {
    return error.errors.map(err => {
      const path = err.path.join('.');
      return `${path}: ${err.message} (received: ${err.code})`;
    });
  }

  getResults(): ContractValidationResult[] {
    return [...this.results];
  }

  getSummary(): {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    avgDuration: number;
    failures: ContractValidationResult[];
  } {
    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const skipped = this.results.filter(r => r.status === 'skip').length;
    const durations = this.results.filter(r => r.status !== 'skip').map(r => r.duration);
    const avgDuration = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0;

    return {
      total: this.results.length,
      passed,
      failed,
      skipped,
      avgDuration: Math.round(avgDuration),
      failures: this.results.filter(r => r.status === 'fail'),
    };
  }

  printSummary(): void {
    const summary = this.getSummary();
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 LIVE API CONTRACT VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Endpoints:  ${summary.total}`);
    console.log(`✅ Passed:        ${summary.passed}`);
    console.log(`❌ Failed:        ${summary.failed}`);
    console.log(`⏭️  Skipped:       ${summary.skipped}`);
    console.log(`⏱️  Avg Duration:  ${summary.avgDuration}ms`);
    
    if (summary.failures.length > 0) {
      console.log('\n🔴 Contract Violations:');
      for (const failure of summary.failures) {
        console.error(`  ${failure.method} ${failure.endpoint}:`);
        if (failure.validationErrors) {
          failure.validationErrors.forEach(err => console.error(`    - ${err}`));
        }
        if (failure.error) {
          console.error(`    - Request error: ${failure.error}`);
        }
      }
    }
    
    console.log('='.repeat(60));
  }

  reset(): void {
    this.results = [];
  }
}

export function createContractTest(
  schema: ZodSchema,
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  options: Partial<ContractTestConfig> = {}
): ContractTestConfig {
  return {
    endpoint,
    method,
    schema,
    ...options,
  };
}
