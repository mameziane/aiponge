/**
 * Pattern Repository Interface
 * User behavioral patterns and analytics
 */

import { UserPattern, ProfileAnalytics } from '@domains/insights/types';

export interface PatternFilter {
  type?: string;
  minConfidence?: number;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  limit?: number;
}

export interface AnalyticsFilter {
  eventType?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  limit?: number;
}

export interface AnalyticsEvent {
  userId: string;
  eventType: string;
  eventData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

export interface IPatternRepository {
  getUserPatterns(userId: string, filter?: PatternFilter): Promise<UserPattern[]>;
  getProfileAnalytics(userId: string, filter?: AnalyticsFilter): Promise<ProfileAnalytics[]>;
  recordAnalyticsEvent(event: AnalyticsEvent): Promise<void>;
  getAnalyticsEvents(filter?: AnalyticsFilter): Promise<AnalyticsEvent[]>;
}
