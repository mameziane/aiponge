import type { NewUserPattern } from '@domains/insights/types';

export interface EntryForAnalysis {
  id: string;
  userId: string;
  content: string;
  type: string;
  moodContext: string | null;
  sentiment: string | null;
  emotionalIntensity: number | null;
  tags: string[];
  createdAt: Date;
}

export interface PatternInsight {
  patternType: 'emotional' | 'temporal' | 'thematic' | 'behavioral';
  patternName: string;
  description: string;
  frequency: number;
  strength: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  relatedThemes: string[];
  triggerFactors: string[];
}

export interface IPatternAnalysisPort {
  getUserEntries(userId: string, fromDate?: Date, toDate?: Date): Promise<EntryForAnalysis[]>;
  upsertPattern(pattern: NewUserPattern): Promise<unknown>;
  upsertThemeFrequency(userId: string, theme: string): Promise<unknown>;
  getAllUsersWithEntries(minEntries?: number): Promise<string[]>;
  upsertMetrics(userId: string, period: string, insightCount: number, uniqueThemes: string[]): Promise<unknown>;
}
