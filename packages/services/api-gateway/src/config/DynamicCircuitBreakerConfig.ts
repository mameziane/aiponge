import { getLogger } from './service-urls';

const logger = getLogger('api-gateway-dynamiccircuitbreakerconfig');

const KNOWN_SERVICES = [
  'system-service',
  'storage-service',
  'user-service',
  'ai-config-service',
  'ai-content-service',
  'ai-analytics-service',
  'music-service',
];

// Circuit breaker configuration type
export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
  monitoringWindow?: number;
  halfOpenRequests?: number;
  volumeThreshold?: number;
}

export interface ServiceCircuitBreakerConfig extends CircuitBreakerConfig {
  serviceName: string;
}

export class DynamicCircuitBreakerConfig {
  private static instance: DynamicCircuitBreakerConfig;
  private globalConfig!: CircuitBreakerConfig;
  private serviceConfigs: Map<string, CircuitBreakerConfig> = new Map();

  private constructor() {
    void this.loadConfiguration();
  }

  static getInstance(): DynamicCircuitBreakerConfig {
    if (!DynamicCircuitBreakerConfig.instance) {
      DynamicCircuitBreakerConfig.instance = new DynamicCircuitBreakerConfig();
    }
    return DynamicCircuitBreakerConfig.instance;
  }

  private loadConfiguration(): void {
    // Load global defaults from environment
    this.globalConfig = {
      failureThreshold: parseInt(process.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
      successThreshold: parseInt(process.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD || '3'),
      timeout: parseInt(process.env.CIRCUIT_BREAKER_TIMEOUT || '60000'),
      resetTimeout: parseInt(process.env.CIRCUIT_BREAKER_RESET_TIMEOUT || '30000'),
      monitoringWindow: parseInt(process.env.CIRCUIT_BREAKER_MONITORING_WINDOW || '10000'),
      volumeThreshold: parseInt(process.env.CIRCUIT_BREAKER_VOLUME_THRESHOLD || '10'),
    };

    // Load service-specific configurations
    void this.loadServiceSpecificConfigs();

    logger.debug('🔧 Circuit Breaker: Global config loaded, {} service-specific configs', {
      data0: this.serviceConfigs.size,
    });
  }

  private loadServiceSpecificConfigs(): void {
    const serviceNames = KNOWN_SERVICES;

    for (const serviceName of serviceNames) {
      const envPrefix = `${serviceName.toUpperCase().replace(/-/g, '_')}_CIRCUIT_BREAKER`;

      // Check if any service-specific config exists
      const hasServiceConfig =
        process.env[`${envPrefix}_FAILURE_THRESHOLD`] ||
        process.env[`${envPrefix}_SUCCESS_THRESHOLD`] ||
        process.env[`${envPrefix}_TIMEOUT`] ||
        process.env[`${envPrefix}_ENABLED`];

      if (hasServiceConfig) {
        const serviceConfig: CircuitBreakerConfig = {
          failureThreshold: parseInt(
            process.env[`${envPrefix}_FAILURE_THRESHOLD`] || this.globalConfig.failureThreshold.toString()
          ),
          successThreshold: parseInt(
            process.env[`${envPrefix}_SUCCESS_THRESHOLD`] || this.globalConfig.successThreshold.toString()
          ),
          timeout: parseInt(process.env[`${envPrefix}_TIMEOUT`] || this.globalConfig.timeout.toString()),
          monitoringWindow: parseInt(
            process.env[`${envPrefix}_MONITORING_WINDOW`] || (this.globalConfig.monitoringWindow || 60000).toString()
          ),
          volumeThreshold: parseInt(
            process.env[`${envPrefix}_VOLUME_THRESHOLD`] || (this.globalConfig.volumeThreshold || 10).toString()
          ),
          resetTimeout: parseInt(
            process.env[`${envPrefix}_RESET_TIMEOUT`] || this.globalConfig.resetTimeout.toString()
          ),
        };

        this.serviceConfigs.set(serviceName, serviceConfig);
      }
    }
  }

  // Public API
  getConfigForService(serviceName: string): CircuitBreakerConfig {
    // Return service-specific config if exists, otherwise global config
    return this.serviceConfigs.get(serviceName) || { ...this.globalConfig };
  }

  getGlobalConfig(): CircuitBreakerConfig {
    return { ...this.globalConfig };
  }

  getAllServiceConfigs(): Map<string, CircuitBreakerConfig> {
    return new Map(this.serviceConfigs);
  }

  // Runtime configuration updates
  updateServiceConfig(serviceName: string, config: Partial<CircuitBreakerConfig>): void {
    const existingConfig = this.getConfigForService(serviceName);
    const updatedConfig = { ...existingConfig, ...config };
    this.serviceConfigs.set(serviceName, updatedConfig);

    logger.warn('🔧 Circuit Breaker: Updated config for {}', { data0: serviceName });
  }

  updateGlobalConfig(config: Partial<CircuitBreakerConfig>): void {
    this.globalConfig = { ...this.globalConfig, ...config };
    logger.warn('🔧 Circuit Breaker: Updated global config');
  }

  // Hot reload from environment
  reloadConfiguration(): void {
    logger.warn('Reloading circuit breaker configuration...');
    this.serviceConfigs.clear();
    void this.loadConfiguration();
    logger.warn('Circuit breaker configuration reloaded');
  }

  // Configuration validation
  validateConfig(config: CircuitBreakerConfig): { isValid: boolean; errors: string[] } {
    const _services: string[] = [];
    const errors: string[] = [];

    if (config.failureThreshold <= 0) {
      errors.push('failureThreshold must be greater than 0');
    }

    if (config.successThreshold <= 0) {
      errors.push('successThreshold must be greater than 0');
    }

    if (config.timeout <= 0) {
      errors.push('timeout must be greater than 0');
    }

    if (config.monitoringWindow && config.monitoringWindow <= 0) {
      errors.push('monitoringWindow must be greater than 0');
    }

    if (config.volumeThreshold && config.volumeThreshold <= 0) {
      errors.push('volumeThreshold must be greater than 0');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  // Get configuration summary for monitoring
  getConfigSummary(): {
    global: CircuitBreakerConfig;
    serviceOverrides: Record<string, CircuitBreakerConfig>;
    totalServices: number;
  } {
    const serviceOverrides: Record<string, CircuitBreakerConfig> = {};

    for (const [serviceName, config] of Array.from(this.serviceConfigs.entries())) {
      serviceOverrides[serviceName] = { ...config };
    }

    return {
      global: { ...this.globalConfig },
      serviceOverrides,
      totalServices: this.serviceConfigs.size,
    };
  }
}

// Export singleton instance
export const circuitBreakerConfig = DynamicCircuitBreakerConfig.getInstance();
