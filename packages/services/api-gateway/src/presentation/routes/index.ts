/**
 * Routes Index
 * Export all route configurations and specialized handlers
 */

export { GatewayRoutes } from './GatewayRoutes';

// Specialized route handlers
export { default as healthRoutes } from './health.routes';
export { adminRoutes } from './admin.routes';
export { appRoutes } from './app.routes';

// Export route classes for advanced usage
export { HealthRoutes } from './health.routes';
