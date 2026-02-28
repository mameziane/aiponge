import {
  type CrossServiceReference,
  type IntegrityGuardConfig,
  type ServiceName,
  OperationType,
} from './types.js';
import {
  CROSS_SERVICE_REFERENCES,
  getReferencesRequiringValidation,
} from './references.js';

interface CacheEntry {
  valid: boolean;
  exists: boolean;
  timestamp: number;
}

class ManagedInterval {
  private timer: ReturnType<typeof setInterval> | null = null;

  start(handler: () => void, intervalMs: number): void {
    this.stop();
    this.timer = setInterval(handler, intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export class IntegrityGuard {
  private config: IntegrityGuardConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheCleanupScheduler = new ManagedInterval();

  constructor(config: IntegrityGuardConfig) {
    this.config = config;

    if (config.cacheEnabled) {
      this.cacheCleanupScheduler.start(() => this.cleanupCache(), config.cacheTtlMs);
    }
  }

  private getCacheKey(referenceType: string, referenceId: string): string {
    return `${referenceType}:${referenceId}`;
  }

  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.config.cacheTtlMs) {
        this.cache.delete(key);
      }
    }
  }

  async validateBeforeCreate<T extends Record<string, unknown>>(
    tableName: string,
    data: T
  ): Promise<{ valid: boolean; errors: string[] }> {
    return this.validateReferences(tableName, data, OperationType.CREATE);
  }

  async validateBeforeUpdate<T extends Record<string, unknown>>(
    tableName: string,
    data: T
  ): Promise<{ valid: boolean; errors: string[] }> {
    return this.validateReferences(tableName, data, OperationType.UPDATE);
  }

  async validateBeforeDelete(
    tableName: string,
    _recordId: string
  ): Promise<{ valid: boolean; errors: string[]; dependentServices: ServiceName[] }> {
    const refs = getReferencesRequiringValidation(tableName, OperationType.DELETE);
    const dependentServices = [...new Set(refs.map(r => r.targetService))];

    return {
      valid: true,
      errors: [],
      dependentServices,
    };
  }

  private async validateReferences<T extends Record<string, unknown>>(
    tableName: string,
    data: T,
    operation: OperationType
  ): Promise<{ valid: boolean; errors: string[] }> {
    const refs = getReferencesRequiringValidation(tableName, operation);
    const errors: string[] = [];

    for (const ref of refs) {
      const columnName = this.snakeToCamel(ref.sourceColumn);
      const referenceId = data[columnName] as string | undefined;

      if (!referenceId) {
        if (ref.requiredForCreate && operation === OperationType.CREATE) {
          errors.push(`Missing required reference: ${ref.referenceType}`);
        }
        continue;
      }

      const cacheKey = this.getCacheKey(ref.referenceType, referenceId);
      const cached = this.cache.get(cacheKey);

      if (cached && Date.now() - cached.timestamp < this.config.cacheTtlMs) {
        if (!cached.valid || !cached.exists) {
          errors.push(`Invalid ${ref.referenceType} reference: ${referenceId} does not exist`);
        }
        continue;
      }

      const client = this.config.serviceClients.get(ref.targetService);
      if (!client) {
        if (this.config.strictMode) {
          errors.push(`No client configured for service: ${ref.targetService}`);
        }
        continue;
      }

      try {
        const result = await client.verifyReference(ref.referenceType, referenceId);

        if (this.config.cacheEnabled) {
          this.cache.set(cacheKey, {
            valid: result.valid,
            exists: result.exists,
            timestamp: Date.now(),
          });
        }

        if (!result.valid || !result.exists) {
          const error = `Invalid ${ref.referenceType} reference: ${referenceId} does not exist`;
          errors.push(error);

          if (this.config.onViolation) {
            this.config.onViolation({
              sourceService: this.config.currentService,
              sourceTable: tableName,
              targetService: ref.targetService,
              referenceType: ref.referenceType,
              referenceId,
              operation,
              error,
            });
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (this.config.strictMode) {
          errors.push(`Failed to validate ${ref.referenceType} reference: ${errorMsg}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  getReferencesForTable(tableName: string): CrossServiceReference[] {
    return CROSS_SERVICE_REFERENCES.filter(ref => ref.sourceTable === tableName);
  }

  getDependentServicesForDelete(tableName: string): ServiceName[] {
    const refs = getReferencesRequiringValidation(tableName, OperationType.DELETE);
    return [...new Set(refs.map(r => r.targetService))];
  }

  invalidateCache(referenceType?: string, referenceId?: string): void {
    if (referenceType && referenceId) {
      this.cache.delete(this.getCacheKey(referenceType, referenceId));
    } else if (referenceType) {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${referenceType}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      this.cache.clear();
    }
  }

  getCacheStats(): { size: number } {
    return {
      size: this.cache.size,
    };
  }

  destroy(): void {
    this.cacheCleanupScheduler.stop();
    this.cache.clear();
  }

  private snakeToCamel(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}

export function createIntegrityGuard(
  config: Partial<IntegrityGuardConfig> & { currentService: ServiceName }
): IntegrityGuard {
  return new IntegrityGuard({
    serviceClients: new Map(),
    strictMode: false,
    cacheEnabled: true,
    cacheTtlMs: 60000,
    ...config,
  });
}
