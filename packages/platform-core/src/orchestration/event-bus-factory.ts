/**
 * Event Bus Factory
 * Selects Redis or Kafka event bus implementation based on environment configuration
 */

import { getLogger } from '../logging/logger.js';
import type { IStandardizedEventBusClient } from './event-bus-client.js';
import { RedisEventBusClient } from './event-bus-client.js'; // eslint-disable-line no-duplicate-imports
import { KafkaEventBusClient } from './kafka-event-bus-client.js';

const logger = getLogger('event-bus-factory');

export type EventBusProvider = 'redis' | 'kafka';

export function createEventBusClient(serviceName: string): IStandardizedEventBusClient {
  const provider = (process.env.EVENT_BUS_PROVIDER || 'redis').toLowerCase() as EventBusProvider;

  switch (provider) {
    case 'kafka':
      logger.debug('Creating Kafka event bus client for {}', { data0: serviceName });
      return new KafkaEventBusClient(serviceName);
    case 'redis':
    default:
      logger.debug('Creating Redis event bus client for {}', { data0: serviceName });
      return new RedisEventBusClient(serviceName);
  }
}
