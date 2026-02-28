/**
 * Insight Repository Interface
 * AI-generated insights from user entries
 */

import { Insight, NewInsight } from '@domains/insights/types';

export interface InsightFilter {
  category?: string;
  type?: string;
  entryId?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  limit?: number;
  offset?: number;
}

export interface IInsightRepository {
  createInsight(insight: NewInsight): Promise<Insight>;
  createInsightsBulk(insights: NewInsight[]): Promise<Insight[]>;
  findInsightsByUserId(userId: string, limit?: number): Promise<Insight[]>;
  findInsightsByEntryId(entryId: string): Promise<Insight[]>;
  getInsightsByUser(userId: string, filter?: InsightFilter): Promise<Insight[]>;
}
