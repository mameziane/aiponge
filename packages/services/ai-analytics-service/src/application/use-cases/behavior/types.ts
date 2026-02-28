/**
 * Shared types for User Behavior Analytics Use Cases
 */

import type { UserRole } from '@aiponge/shared-contracts';

export interface TrackUserBehaviorRequest {
  userId?: string;
  userType?: UserRole;
  sessionId?: string;
  eventType:
    | 'page_view'
    | 'feature_usage'
    | 'workflow_start'
    | 'workflow_complete'
    | 'error'
    | 'search'
    | 'interaction';
  action: string;
  feature?: string;
  context?: Record<string, unknown>;
  timestamp?: Date;
  duration?: number;
  deviceInfo?: {
    type: 'desktop' | 'mobile' | 'tablet';
    browser?: string;
    os?: string;
    screenResolution?: string;
  };
  location?: {
    ip?: string;
    country?: string;
    city?: string;
    timezone?: string;
  };
  referrer?: string;
  userAgent?: string;
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
  customDimensions?: Record<string, string>;
  customMetrics?: Record<string, number>;
}

export interface GetUserBehaviorAnalyticsRequest {
  userId?: string;
  userType?: UserRole;
  userSegment?: string;
  startTime?: Date;
  endTime?: Date;
  timeRange?: 'last_hour' | 'last_24h' | 'last_7d' | 'last_30d' | 'last_90d';
  eventTypes?: string[];
  features?: string[];
  actions?: string[];
  includeSessionAnalysis?: boolean;
  includeFunnelAnalysis?: boolean;
  includeRetentionAnalysis?: boolean;
  includeEngagementMetrics?: boolean;
  includeConversionAnalysis?: boolean;
  includeSegmentAnalysis?: boolean;
  includePredictiveAnalytics?: boolean;
  groupBy?: 'user' | 'feature' | 'action' | 'day' | 'hour' | 'week' | 'month';
  aggregationWindow?: 'minute' | 'hour' | 'day' | 'week' | 'month';
  limit?: number;
  offset?: number;
}

export interface CohortAnalysisRequest {
  cohortType: 'registration' | 'first_usage' | 'subscription' | 'custom';
  startDate: Date;
  endDate: Date;
  periods: number;
  periodType: 'day' | 'week' | 'month';
  metricType: 'retention' | 'revenue' | 'usage' | 'engagement';
}

export interface TrackUserBehaviorResult {
  success: boolean;
  eventId: string;
  userId?: string;
  sessionId?: string;
  timestamp: Date;
  processingTimeMs: number;
  error?: {
    code: string;
    message: string;
  };
  insights?: {
    isNewUser: boolean;
    sessionDuration?: number;
    previousActions: number;
    engagementScore: number;
  };
}

export interface BehaviorSummary {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  returningUsers: number;
  totalSessions: number;
  avgSessionDuration: number;
  totalPageViews: number;
  totalInteractions: number;
  conversionRate: number;
  bounceRate: number;
  topFeatures: Array<{
    feature: string;
    usage: number;
    uniqueUsers: number;
    avgDuration: number;
  }>;
  topActions: Array<{
    action: string;
    count: number;
    successRate: number;
  }>;
  userGrowth: {
    trend: 'growing' | 'stable' | 'declining';
    rate: number;
    comparison: 'vs_previous_period';
  };
}

export interface UserMetrics {
  userId: string;
  userType: UserRole;
  firstSeen: Date;
  lastSeen: Date;
  totalSessions: number;
  totalDuration: number;
  pageViews: number;
  interactions: number;
  featuresUsed: string[];
  conversionEvents: number;
  engagementScore: number;
  loyaltyScore: number;
  riskScore: number;
  preferredFeatures: Array<{
    feature: string;
    usage: number;
    proficiency: number;
  }>;
  behaviorPattern: 'explorer' | 'power_user' | 'casual' | 'churned' | 'new';
  cohort: string;
  lifetime: {
    value: number;
    usage: number;
    conversion: number;
  };
}

export interface SessionAnalysis {
  sessionId: string;
  userId: string;
  startTime: Date;
  endTime?: Date;
  duration: number;
  pageViews: number;
  interactions: number;
  conversions: number;
  bounced: boolean;
  exitPage?: string;
  referrer?: string;
  deviceType: string;
  location: string;
  events: Array<{
    timestamp: Date;
    eventType: string;
    action: string;
    feature?: string;
    duration?: number;
    success: boolean;
  }>;
  flowAnalysis: {
    entryPoint: string;
    path: string[];
    dropoffPoint?: string;
    completionRate: number;
  };
  engagement: {
    score: number;
    depth: number;
    timeOnPage: Record<string, number>;
  };
}

export interface FunnelAnalysis {
  funnelId: string;
  name: string;
  steps: Array<{
    step: number;
    name: string;
    eventType: string;
    action: string;
    users: number;
    conversionRate: number;
    dropoffRate: number;
    avgTimeToNext?: number;
  }>;
  overallConversionRate: number;
  totalDropoffs: number;
  insights: Array<{
    step: number;
    insight: string;
    severity: 'low' | 'medium' | 'high';
    recommendation: string;
  }>;
  comparison?: {
    period: string;
    conversionRateChange: number;
    significantChanges: Array<{
      step: number;
      change: number;
      reason?: string;
    }>;
  };
}

export interface RetentionAnalysis {
  cohortId: string;
  cohortSize: number;
  cohortDate: Date;
  retentionType: 'day' | 'week' | 'month';
  periods: Array<{
    period: number;
    retained: number;
    retentionRate: number;
    churnRate: number;
  }>;
  metrics: {
    day1Retention: number;
    day7Retention: number;
    day30Retention: number;
    avgRetention: number;
    churnRisk: number;
  };
  segments: Array<{
    segmentName: string;
    retentionRate: number;
    comparison: number;
  }>;
  insights: string[];
}

export interface EngagementAnalysis {
  overallScore: number;
  distribution: {
    highly_engaged: number;
    moderately_engaged: number;
    low_engagement: number;
    dormant: number;
  };
  metrics: {
    avgSessionsPerUser: number;
    avgSessionDuration: number;
    featuresPerSession: number;
    returnVisitorRate: number;
    stickiness: number;
  };
  trends: {
    engagementTrend: 'increasing' | 'stable' | 'decreasing';
    weeklyChange: number;
    monthlyChange: number;
  };
  topEngagementDrivers: Array<{
    feature: string;
    impact: number;
    usage: number;
  }>;
  segmentAnalysis: Array<{
    userType: string;
    engagementScore: number;
    keyMetrics: Record<string, number>;
  }>;
}

export interface ConversionAnalysis {
  overallRate: number;
  conversionsByEvent: Record<
    string,
    {
      rate: number;
      count: number;
      value: number;
    }
  >;
  conversionFunnels: Array<{
    name: string;
    steps: string[];
    rate: number;
    bottlenecks: Array<{
      step: string;
      dropoffRate: number;
    }>;
  }>;
  attribution: Array<{
    channel: string;
    conversions: number;
    rate: number;
    value: number;
  }>;
  timeToConversion: {
    average: number;
    median: number;
    distribution: Record<string, number>;
  };
  cohortPerformance: Array<{
    cohort: string;
    conversionRate: number;
    timeToConvert: number;
  }>;
}

export interface SegmentAnalysis {
  segmentId: string;
  segmentName: string;
  userCount: number;
  criteria: Record<string, unknown>;
  metrics: {
    avgEngagement: number;
    conversionRate: number;
    retention: number;
    lifetime: {
      value: number;
      usage: number;
    };
  };
  characteristics: {
    topFeatures: string[];
    commonBehaviors: string[];
    preferredTimes: string[];
    deviceTypes: Record<string, number>;
  };
  comparison: {
    vsOverall: Record<string, number>;
    vsOtherSegments: Array<{
      segmentName: string;
      keyDifferences: Record<string, number>;
    }>;
  };
  insights: string[];
  recommendations: string[];
}

export interface BehaviorInsight {
  id: string;
  type: 'usage' | 'engagement' | 'conversion' | 'retention' | 'churn' | 'opportunity';
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  affectedUsers: number;
  impact: {
    metric: string;
    currentValue: number;
    potentialImprovement: number;
  };
  evidence: {
    dataPoints: number;
    timeframe: string;
    sources: string[];
  };
  recommendations: Array<{
    action: string;
    priority: 'low' | 'medium' | 'high';
    effort: 'low' | 'medium' | 'high';
    expectedImpact: string;
  }>;
  relatedInsights?: string[];
}

export interface PredictiveUserAnalytics {
  churnPrediction: {
    atRiskUsers: Array<{
      userId: string;
      churnProbability: number;
      riskFactors: string[];
      daysUntilChurn: number;
    }>;
    overallChurnRate: number;
    interventionRecommendations: string[];
  };
  engagementForecast: {
    next30Days: number;
    trend: 'increasing' | 'stable' | 'decreasing';
    confidence: number;
  };
  conversionPrediction: {
    likelyConverters: Array<{
      userId: string;
      conversionProbability: number;
      recommendedActions: string[];
    }>;
    expectedConversions: number;
    timeframe: string;
  };
  usageForecasting: {
    expectedGrowth: number;
    featureDemand: Record<string, number>;
    capacityNeeds: string[];
  };
}

export interface CohortAnalysisResult {
  cohortId: string;
  cohortType: string;
  startDate: Date;
  endDate: Date;
  totalCohorts: number;
  results: Array<{
    cohortDate: Date;
    initialSize: number;
    retentionRates: number[];
    values: number[];
  }>;
  insights: {
    bestPerformingCohort: string;
    worstPerformingCohort: string;
    averageRetention: number[];
    trends: string[];
  };
  visualization: {
    heatmapData: number[][];
    trendData: Array<{ period: number; retention: number }>;
  };
}

export interface GetUserBehaviorAnalyticsResult {
  summary: BehaviorSummary;
  userMetrics: UserMetrics[];
  sessions?: SessionAnalysis[];
  funnel?: FunnelAnalysis;
  retention?: RetentionAnalysis;
  engagement?: EngagementAnalysis;
  conversions?: ConversionAnalysis;
  segments?: SegmentAnalysis[];
  insights: BehaviorInsight[];
  predictiveMetrics?: PredictiveUserAnalytics;
  timeRange: { start: Date; end: Date };
  lastUpdated: Date;
}

export interface TimeRange {
  start: Date;
  end: Date;
}
