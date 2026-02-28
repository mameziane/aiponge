/**
 * Service Locator Types
 *
 * Interfaces and types for service discovery functionality
 */

export interface ServiceResource {
  type: 'database' | 'cache' | 'queue' | 'storage' | 'external-api';
  name: string;
  required: boolean;
}

export interface ServiceDefinition {
  name: string;
  port: number;
  host?: string;
  healthEndpoint?: string;
  type?: 'backend-service' | 'frontend-app' | 'infrastructure';
  tier?: 'infrastructure' | 'foundation' | 'application' | 'frontend';
  resources?: ServiceResource[];
}

export interface ServiceLocatorOptions {
  services?: ServiceDefinition[];
  defaultHost?: string;
  defaultHealthEndpoint?: string;
}
