/**
 * Shared types and utilities for profile highlight use cases
 * Eliminates any types by providing strongly-typed interfaces
 */

import type { EntryRecord, InsightRecord } from '@domains/profile';
import type { PatternRecord, ProfileAnalyticsRecord } from '@infrastructure/repositories';

export interface UserHighlightData {
  entries: EntryRecord[];
  insights: InsightRecord[];
  patterns: PatternRecord[];
  analytics: ProfileAnalyticsRecord[];
  profile: ProfileSummary | null;
  timeframe: DateRange;
}

export interface ProfileSummary {
  userId: string;
  totalInsights: number;
  totalReflections: number;
  totalEntries?: number;
}

export interface DateRange {
  start: Date;
  end: Date;
}

export interface HighlightFilters {
  minImpactScore?: number;
  minRarityScore?: number;
  requireNarrative?: boolean;
  includeDrafts?: boolean;
}

export interface HighlightMetrics {
  impactScore: number;
  rarityScore: number;
  growthContribution: number;
  qualityScore: number;
}

export type HighlightCategory =
  | 'emotional'
  | 'cognitive'
  | 'behavioral'
  | 'social'
  | 'spiritual'
  | 'creative'
  | 'wellness';
export type HighlightSignificance = 'high' | 'medium' | 'low';

export function parseConfidence(confidence: string | null | undefined): number {
  return parseFloat(confidence || '0');
}

export function parseStrength(strength: string | null | undefined): number {
  return parseFloat(strength || '0');
}

export function getHighConfidenceInsights(insights: InsightRecord[], threshold = 0.8): InsightRecord[] {
  return insights.filter(i => parseConfidence(i.confidence) > threshold);
}

export function getHighStrengthPatterns(patterns: PatternRecord[], threshold = 0.8): PatternRecord[] {
  return patterns.filter(p => parseStrength(p.strength) > threshold && p.isActive);
}

export function calculateAverageConfidence(insights: InsightRecord[]): number {
  if (insights.length === 0) return 0;
  return insights.reduce((sum, i) => sum + parseConfidence(i.confidence), 0) / insights.length;
}

export function calculateAverageWordCount(entries: EntryRecord[]): number {
  if (entries.length === 0) return 0;
  return entries.reduce((sum, t) => sum + t.content.split(/\s+/).length, 0) / entries.length;
}

export function filterEntriesByIds(entries: EntryRecord[], ids: string[]): EntryRecord[] {
  return entries.filter(t => ids.includes(t.id));
}

export function filterInsightsByIds(insights: InsightRecord[], ids: string[]): InsightRecord[] {
  return insights.filter(i => ids.includes(i.id));
}

export function mapInsightCategoryToHighlight(category: string | null | undefined): HighlightCategory {
  const mapping: Record<string, HighlightCategory> = {
    emotional: 'emotional',
    behavioral: 'behavioral',
    cognitive: 'cognitive',
    social: 'social',
    spiritual: 'spiritual',
    creative: 'creative',
    wellness: 'wellness',
    health: 'wellness',
    mental: 'cognitive',
    physical: 'wellness',
  };
  return mapping[category?.toLowerCase() || ''] || 'cognitive';
}

export function mapPatternTypeToCategory(patternType: string): HighlightCategory {
  const mapping: Record<string, HighlightCategory> = {
    emotional: 'emotional',
    behavioral: 'behavioral',
    temporal: 'behavioral',
    thematic: 'cognitive',
    cognitive: 'cognitive',
  };
  return mapping[patternType.toLowerCase()] || 'behavioral';
}

export function mapGrowthAreaToCategory(area: string): string {
  const mapping: Record<string, string> = {
    emotional: 'personal',
    cognitive: 'learning',
    behavioral: 'personal',
    social: 'relationships',
    spiritual: 'spiritual',
    creative: 'creative',
    wellness: 'health',
  };
  return mapping[area.toLowerCase()] || 'personal';
}

export interface ImportedDataRecord {
  basicProfile?: Record<string, unknown>;
  entries: ImportedEntry[];
  insights: ImportedInsight[];
  patterns: ImportedPattern[];
  analytics: ImportedAnalytic[];
}

export interface ImportedEntry {
  content: string;
  type: string;
  createdAt?: string;
  moodContext?: string;
  triggerSource?: string;
  tags?: string[];
  metadata?: unknown;
  sentiment?: string;
  emotionalIntensity?: number;
}

export interface ImportedInsight {
  entryId?: string;
  type: string;
  content: Record<string, unknown>;
  confidence?: number;
  category?: string;
}

export interface ImportedPattern {
  patternType: string;
  patternName: string;
  strength?: number;
  trend?: string;
}

export interface ImportedAnalytic {
  analysisType: string;
  timeframe: string;
  totalEntries?: number;
  totalInsights?: number;
}

export interface ExportEntryData {
  id: string;
  content: string;
  type: string;
  moodContext?: string;
  triggerSource?: string;
  sentiment?: string;
  emotionalIntensity?: number;
  tags: string[];
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExportInsightData {
  id: string;
  entryId: string | null;
  type: string;
  title: string;
  content: string;
  confidence: number;
  category?: string;
  themes: string[];
  actionable: boolean;
  priority: number;
  generatedAt: Date;
  validatedAt?: Date;
  validatedBy?: string;
}

export interface GoalAnalysisData {
  insights: InsightRecord[];
  patterns: PatternRecord[];
  entries: EntryRecord[];
  analytics: ProfileAnalyticsRecord[];
  timeframe: DateRange;
}
