/**
 * Template IDs for AI Analytics Service
 * Centralized constants for template identification
 */

export const TEMPLATE_IDS = {
  // Alert Management Templates
  ALERT_NOTIFICATION_MESSAGE: 'analytics-alert-notification',
  ALERT_ESCALATION_MESSAGE: 'analytics-alert-escalation',

  // Recommendation Templates
  THRESHOLD_ADJUSTMENT_HIGH: 'analytics-threshold-too-sensitive',
  THRESHOLD_ADJUSTMENT_LOW: 'analytics-threshold-too-high',

  // Insights Generation Templates
  HIGH_ALERT_VOLUME_INSIGHT: 'analytics-high-alert-volume',
  LONG_RESOLUTION_TIME_INSIGHT: 'analytics-long-resolution-time',
  NOISY_RULES_INSIGHT: 'analytics-noisy-rules-detected',

  // Health Recommendations
  CRITICAL_ISSUE_RECOMMENDATION: 'analytics-critical-issue-action',
  HEALTH_IMPROVEMENT_SUGGESTION: 'analytics-health-improvement',

  // Cost Optimization Templates
  PROVIDER_SWITCH_RECOMMENDATION: 'analytics-provider-switch-suggestion',
  COST_OPTIMIZATION_GENERAL: 'analytics-cost-optimization-general',
  USAGE_OPTIMIZATION_TIP: 'analytics-usage-optimization',

  // General Analytics Templates
  PERFORMANCE_SUMMARY: 'analytics-performance-summary',
  TREND_ANALYSIS: 'analytics-trend-analysis',
  ANOMALY_EXPLANATION: 'analytics-anomaly-explanation',
} as const;

export type TemplateId = (typeof TEMPLATE_IDS)[keyof typeof TEMPLATE_IDS];
