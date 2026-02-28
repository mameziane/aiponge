/**
 * Unified event contracts for the onboarding system
 * Exports all event types and schemas for cross-service communication
 */

// Base event schema
export * from './BaseEvent.js';

// Domain Events
export * from './MusicEvents.js';

// Infrastructure Events (for decoupling circular dependencies)
export * from './ConfigEvents.js';
export * from './StorageEvents.js';
export * from './SystemEvents.js';
export * from './AnalyticsEvents.js';
export * from './UserEvents.js';
