/**
 * Orchestration Types
 *
 * Interfaces and types for service orchestration functionality
 */

export interface ServiceRegistrationOptions {
  serviceName: string;
  port: number;
  capabilities?: string[];
  endpoints?: Record<string, string>;
  features?: Record<string, string>;
  version?: string;
  dependencies?: string[];
}
