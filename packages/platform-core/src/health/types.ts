/**
 * Health Check Types
 *
 * Interfaces and types for health checking functionality
 */

export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTimeMs?: number;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface HealthResponse {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version?: string;
  uptime: number;
  memory: ReturnType<typeof process.memoryUsage>;
  capabilities?: string[];
  features?: string[];
  endpoints?: Record<string, string>;
  components?: {
    database?: ComponentHealth;
    dependencies?: Record<string, ComponentHealth>;
  };
}

export interface ReadinessResponse {
  ready: boolean;
  service: string;
  timestamp: string;
  version?: string;
  uptime: number;
  components: {
    database?: ComponentHealth;
    dependencies?: Record<string, ComponentHealth>;
    slo?: ComponentHealth;
  };
  message?: string;
  retryAfterSeconds?: number;
}

export interface LivenessResponse {
  alive: boolean;
  service: string;
  timestamp: string;
  uptime: number;
}

export interface StartupResponse {
  started: boolean;
  service: string;
  timestamp: string;
  uptime: number;
  checks?: Record<string, boolean>;
  message?: string;
}
