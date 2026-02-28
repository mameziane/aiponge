export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'maintenance';
  maintenance?: boolean;
  timestamp: string;
  uptime: number;
  version: string;
  services?: ServiceHealthStatus[];
  discovery?: {
    mode: 'dynamic' | 'static' | 'transitioning';
    systemServiceAvailable: boolean;
    lastDynamicAttempt?: Date;
    lastStaticFallback?: Date;
    lastModeSwitch?: Date;
    probeInterval: number;
    failureCount: number;
    successCount: number;
  };
  memory?: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu?: {
    usage: number;
  };
}

export interface ServiceHealthStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime?: number;
  lastCheck: string;
  error?: string;
}

export interface ServiceHealth {
  serviceName: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastChecked: string;
  responseTime: number;
  version?: string;
  dependencies: ServiceDependency[];
  metrics: HealthMetrics;
  endpoint: string;
  errors: string[];
}

export interface ServiceDependency {
  serviceName: string;
  type: 'database' | 'cache' | 'external-api' | 'internal-service' | 'queue';
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  required: boolean;
  responseTime?: number;
  lastChecked: string;
  errorCount: number;
}

export interface HealthMetrics {
  uptime: number;
  requestCount: number;
  errorRate: number;
  averageResponseTime: number;
  memoryUsage?: number;
  cpuUsage?: number;
}

export interface SystemHealthSummary {
  overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  totalServices: number;
  healthyServices: number;
  degradedServices: number;
  unhealthyServices: number;
  criticalIssues: string[];
  lastUpdated: string;
  services: ServiceHealth[];
  dependencyGraph: DependencyNode[];
  systemHealthPercentage: number;
}

export interface DependencyNode {
  serviceName: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  dependencies: string[];
  dependents: string[];
  criticalityScore: number;
}
