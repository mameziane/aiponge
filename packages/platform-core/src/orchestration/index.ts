/**
 * Orchestration Module - Index
 *
 * Exports all orchestration functionality for platform-core
 * Includes consolidated event bus and service discovery functionality
 */

// Types
export * from './types.js';

// Event bus client (consolidated from shared/backend)
export * from './event-bus-client.js';

// Event subscriber (idempotent consumption with retry)
export * from './event-subscriber.js';

// Analytics event publisher (replaces HTTP calls to analytics service)
export * from './analytics-event-publisher.js';

// Service discovery client (consolidated from shared/backend)
export * from './service-discovery-client.js';

// Kafka event bus client (alternative to Redis)
export * from './kafka-event-bus-client.js';

// Event bus factory (Redis or Kafka selection)
export * from './event-bus-factory.js';
