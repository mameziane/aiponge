/**
 * Analysis Repository Interface
 * Interface for analytics, patterns, and analysis data
 */

export interface PatternFilter {
  dateFrom?: Date;
  dateTo?: Date;
  isActive?: boolean;
  patternType?: string;
}

export interface AnalyticsFilter {
  validFrom?: Date;
  validTo?: Date;
  analysisType?: string;
}

export interface PatternRecord {
  id: string;
  userId: string;
  patternType: string;
  patternName: string;
  description: string | null;
  frequency: number | null;
  strength: string | null;
  trend: string | null;
  firstObserved: Date;
  lastObserved: Date;
  relatedThemes: string[] | null;
  triggerFactors: string[] | null;
  isActive: boolean | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProfileAnalyticsRecord {
  id: string;
  userId: string;
  analysisType: string;
  timeframe: string;
  progressIndicators: unknown;
  computedAt: Date;
  validFrom: Date;
  validTo: Date;
  createdAt: Date;
}

export interface AnalyticsEventData {
  userId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface IAnalysisRepository {
  getUserPatterns(userId: string, filter?: PatternFilter): Promise<PatternRecord[]>;
  getProfileAnalytics(userId: string, filter?: AnalyticsFilter): Promise<ProfileAnalyticsRecord[]>;
  recordAnalyticsEvent(event: AnalyticsEventData): Promise<void>;
}
