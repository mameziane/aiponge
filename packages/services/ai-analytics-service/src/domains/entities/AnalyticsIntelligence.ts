/**
 * Analytics Intelligence Domain Entities
 */

export type AnomalyType =
  | 'spike'
  | 'drop'
  | 'trend_change'
  | 'threshold_breach'
  | 'pattern_deviation'
  | 'outlier'
  | 'statistical_anomaly'
  | 'cost_spike';

export interface AnomalyDetectionResult {
  id?: string;
  metricName: string;
  serviceName?: string;
  providerId?: string;
  anomalyType: AnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'detected' | 'active' | 'acknowledged' | 'investigating' | 'resolved' | 'false_positive';
  score?: number;
  expectedValue?: number;
  actualValue: number;
  deviation?: number;
  deviationScore?: number;
  description: string;
  context?: Record<string, unknown>;
  detectedAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface CostOptimizationRecommendation {
  id?: string;
  type: 'provider_switch' | 'model_downgrade' | 'caching' | 'batching' | 'rate_optimization';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  estimatedSavings: number;
  estimatedSavingsPercent: number;
  currentCost: number;
  projectedCost: number;
  affectedProviders: string[];
  implementation?: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface PerformanceInsight {
  id?: string;
  category: 'latency' | 'throughput' | 'error_rate' | 'cost' | 'utilization';
  impact: 'low' | 'medium' | 'high';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  serviceNames: string[];
  providerIds?: string[];
  metrics: Record<string, number>;
  recommendation?: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  metricName: string;
  condition: 'gt' | 'lt' | 'gte' | 'lte' | 'eq' | 'neq';
  threshold: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  cooldownMinutes: number;
  notificationChannels: string[];
  tags?: Record<string, string>;
  triggerCount: number;
  lastTriggeredAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}
