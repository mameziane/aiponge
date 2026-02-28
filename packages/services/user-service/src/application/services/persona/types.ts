/**
 * Shared types for persona analysis services
 */

export interface EntryItem {
  id: string;
  userId: string;
  chapterId?: string | null;
  chapterSortOrder?: number | null;
  content: string;
  type: string;
  moodContext?: string | null;
  triggerSource?: string | null;
  sentiment?: string | null;
  emotionalIntensity?: number | null;
  processingStatus?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export interface InsightEntry {
  id: string;
  userId: string;
  entryId?: string | null;
  type: string;
  title: string;
  content: string | { title?: string };
  confidence?: number | string | null;
  category?: string | null;
  themes?: string[];
  actionable?: boolean;
  priority?: number | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  generatedAt: Date | string;
  createdAt: Date | string;
}

export interface PatternEntry {
  id: string;
  userId: string;
  patternType: string;
  patternName: string;
  description?: string | null;
  frequency?: number;
  strength?: number | string | null;
  trend?: string | null;
  firstObserved: Date | string;
  lastObserved: Date | string;
  relatedThemes?: string[];
  triggerFactors?: string[];
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date | string;
  updatedAt?: Date | string;
}

export interface AnalyticsEntry {
  id: string;
  userId: string;
  analysisType: string;
  timeframe: string;
  progressIndicators?: Record<string, unknown>;
  computedAt: Date | string;
  validFrom: Date | string;
  validTo: Date | string;
  createdAt: Date | string;
}

export interface HistoricalData {
  historicalEntries?: EntryItem[];
  historicalInsights?: InsightEntry[];
}

export interface PersonaAnalysisInput {
  entries: EntryItem[];
  insights: InsightEntry[];
  patterns: PatternEntry[];
  analytics: AnalyticsEntry[];
  historicalData: HistoricalData;
  totalDataPoints: number;
  timeframe: { start: Date; end: Date };
}

export type PersonalizationDepth = 'basic' | 'detailed' | 'comprehensive';

export interface TraitAnalysis {
  score: number;
  confidence: number;
  description: string;
  evidence: string[];
}

export interface EmotionalProfile {
  dominantEmotions: string[];
  emotionalRange: number;
  emotionalStability: number;
  resilience: number;
}

export interface PersonalityTrait {
  trait: string;
  score: number;
  confidence: number;
  description: string;
  evidence: string[];
}

export interface PersonalityData {
  primaryTraits: PersonalityTrait[];
  secondaryTraits: PersonalityTrait[];
  personalityType: string;
  cognitiveStyle: string;
  emotionalProfile: EmotionalProfile;
}

export interface BehaviorPattern {
  pattern: string;
  frequency: number;
  strength: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  timeframe: string;
  examples: string[];
}

export interface BehaviorPreferences {
  communicationStyle: string;
  learningStyle: string;
  decisionMaking: string;
  conflictResolution: string;
}

export interface BehaviorData {
  patterns: BehaviorPattern[];
  preferences: BehaviorPreferences;
  motivators: string[];
  stressors: string[];
}

export interface CognitiveData {
  thinkingPatterns: string[];
  problemSolvingStyle: string;
  creativity: number;
  analyticalThinking: number;
  intuitiveThinkers: number;
}

export interface SocialData {
  relationshipStyle: string;
  socialNeeds: string[];
  communicationPreferences: string[];
}

export interface GrowthData {
  developmentAreas: string[];
  strengths: string[];
  potentialGrowthPaths: string[];
}
