/**
 * Circuit Breaker Manager
 *
 * Re-exports from @aiponge/platform-core resilience module
 * and initializes presets for known internal services.
 */

export {
  resilience,
  withResilience,
  configureResilience,
  usePreset,
  type CircuitBreakerStats,
  type CircuitState,
  type ResilienceConfig,
  type ResilienceEvent,
  type ResilienceEventHandler,
} from '@aiponge/platform-core';

import { usePreset } from '@aiponge/platform-core';

const knownServices = [
  'system-service',
  'storage-service',
  'user-service',
  'ai-config-service',
  'ai-content-service',
  'ai-analytics-service',
  'music-service',
];

for (const service of knownServices) {
  usePreset(service, 'internal-service');
}
