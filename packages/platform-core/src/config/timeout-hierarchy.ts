import { getLogger } from '../logging/logger.js';

const logger = getLogger('timeout-hierarchy');

export interface TimeoutTier {
  gateway: number;
  service: number;
  database: number;
}

export interface TimeoutHierarchyConfig {
  defaults: TimeoutTier;
  serviceOverrides: Record<string, Partial<TimeoutTier>>;
}

const DEFAULTS: TimeoutTier = {
  gateway: parseInt(process.env.TIMEOUT_GATEWAY_MS || '60000', 10),
  service: parseInt(process.env.TIMEOUT_SERVICE_MS || '30000', 10),
  database: parseInt(process.env.TIMEOUT_DATABASE_MS || '15000', 10),
};

const SERVICE_OVERRIDES: Record<string, Partial<TimeoutTier>> = {
  'ai-content-service': {
    gateway: parseInt(process.env.TIMEOUT_AI_CONTENT_GATEWAY_MS || '90000', 10),
    service: parseInt(process.env.TIMEOUT_AI_CONTENT_SERVICE_MS || '60000', 10),
    database: parseInt(process.env.TIMEOUT_AI_CONTENT_DATABASE_MS || '30000', 10),
  },
  'music-service': {
    gateway: parseInt(process.env.TIMEOUT_MUSIC_GATEWAY_MS || '90000', 10),
    service: parseInt(process.env.TIMEOUT_MUSIC_SERVICE_MS || '60000', 10),
    database: parseInt(process.env.TIMEOUT_MUSIC_DATABASE_MS || '30000', 10),
  },
  'ai-config-service': {
    gateway: parseInt(process.env.TIMEOUT_AI_CONFIG_GATEWAY_MS || '45000', 10),
    service: parseInt(process.env.TIMEOUT_AI_CONFIG_SERVICE_MS || '30000', 10),
    database: parseInt(process.env.TIMEOUT_AI_CONFIG_DATABASE_MS || '15000', 10),
  },
  'user-service': {
    gateway: parseInt(process.env.TIMEOUT_USER_GATEWAY_MS || '45000', 10),
    service: parseInt(process.env.TIMEOUT_USER_SERVICE_MS || '30000', 10),
    database: parseInt(process.env.TIMEOUT_USER_DATABASE_MS || '15000', 10),
  },
};

function validateTier(tier: TimeoutTier, context: string): string[] {
  const violations: string[] = [];

  if (tier.gateway <= tier.service) {
    violations.push(`[${context}] gateway timeout (${tier.gateway}ms) must be > service timeout (${tier.service}ms)`);
  }
  if (tier.service <= tier.database) {
    violations.push(`[${context}] service timeout (${tier.service}ms) must be > database timeout (${tier.database}ms)`);
  }
  if (tier.gateway <= tier.database) {
    violations.push(`[${context}] gateway timeout (${tier.gateway}ms) must be > database timeout (${tier.database}ms)`);
  }

  return violations;
}

export class TimeoutHierarchy {
  private tiers: Map<string, TimeoutTier> = new Map();
  private validated = false;

  constructor() {
    this.tiers.set('default', { ...DEFAULTS });

    for (const [service, overrides] of Object.entries(SERVICE_OVERRIDES)) {
      this.tiers.set(service, {
        gateway: overrides.gateway ?? DEFAULTS.gateway,
        service: overrides.service ?? DEFAULTS.service,
        database: overrides.database ?? DEFAULTS.database,
      });
    }
  }

  validate(): { valid: boolean; violations: string[] } {
    const allViolations: string[] = [];

    for (const [name, tier] of this.tiers.entries()) {
      allViolations.push(...validateTier(tier, name));
    }

    this.validated = true;

    if (allViolations.length > 0) {
      for (const v of allViolations) {
        logger.warn(`Timeout hierarchy violation: ${v}`);
      }

      const isProduction = process.env.NODE_ENV === 'production';
      const message =
        `${allViolations.length} timeout hierarchy violation(s) detected. ` +
        'Requests may fail at a lower tier before the upper tier can respond. ' +
        'Fix by ensuring TIMEOUT_GATEWAY_MS > TIMEOUT_SERVICE_MS > TIMEOUT_DATABASE_MS.';

      if (isProduction) {
        throw new Error(`FATAL: ${message}`);
      }

      logger.warn(message);
    } else {
      logger.debug('Timeout hierarchy validated successfully', {
        defaults: DEFAULTS,
        overrides: Object.keys(SERVICE_OVERRIDES).length,
      });
    }

    return { valid: allViolations.length === 0, violations: allViolations };
  }

  getForService(serviceName: string): TimeoutTier {
    return this.tiers.get(serviceName) ?? this.tiers.get('default')!;
  }

  getGatewayTimeout(serviceName?: string): number {
    return this.getForService(serviceName ?? 'default').gateway;
  }

  getServiceTimeout(serviceName?: string): number {
    return this.getForService(serviceName ?? 'default').service;
  }

  getDatabaseTimeout(serviceName?: string): number {
    return this.getForService(serviceName ?? 'default').database;
  }

  getDefaults(): TimeoutTier {
    return { ...DEFAULTS };
  }

  getAllTiers(): Record<string, TimeoutTier> {
    const result: Record<string, TimeoutTier> = {};
    for (const [name, tier] of this.tiers.entries()) {
      result[name] = { ...tier };
    }
    return result;
  }

  registerServiceTier(serviceName: string, tier: Partial<TimeoutTier>): void {
    const defaults = this.tiers.get('default')!;
    const merged: TimeoutTier = {
      gateway: tier.gateway ?? defaults.gateway,
      service: tier.service ?? defaults.service,
      database: tier.database ?? defaults.database,
    };

    const violations = validateTier(merged, serviceName);
    if (violations.length > 0) {
      for (const v of violations) {
        logger.warn(`Timeout hierarchy violation on register: ${v}`);
      }
    }

    this.tiers.set(serviceName, merged);
  }
}

export const timeoutHierarchy = new TimeoutHierarchy();
