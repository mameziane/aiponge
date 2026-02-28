export interface EntryData {
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
  createdAt: Date;
  updatedAt?: Date;
}

export interface InsightEntry {
  id: string;
  userId: string;
  entryId?: string | null;
  type: string;
  title: string;
  content: string;
  confidence?: number | string | null;
  category?: string | null;
  themes?: string[];
  actionable?: boolean;
  priority?: number | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  generatedAt: Date;
  createdAt: Date;
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
  firstObserved: Date;
  lastObserved: Date;
  relatedThemes?: string[];
  triggerFactors?: string[];
  isActive?: boolean;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt?: Date;
}

export interface AnalyticsEntry {
  id: string;
  userId: string;
  analysisType: string;
  timeframe: string;
  totalEntries?: number;
  totalInsights?: number;
  averageMood?: number | string | null;
  dominantThemes?: string[];
  growthAreas?: string[];
  breakthroughCount?: number;
  consistencyScore?: number | string | null;
  engagementLevel?: number;
  progressIndicators?: Record<string, unknown>;
  recommendations?: unknown[];
  computedAt: Date;
  validFrom: Date;
  validTo: Date;
  createdAt: Date;
}

export interface WellnessData {
  entries: EntryData[];
  insights: InsightEntry[];
  patterns: PatternEntry[];
  analytics: AnalyticsEntry[];
  historicalWellness: unknown[];
  timeframe: { start: Date; end: Date };
  dataPoints: number;
}

export interface SentimentDistribution {
  positive: number;
  negative: number;
  neutral: number;
}

export interface ClarityMetrics {
  averageClarity: number;
  distribution: { clear: number; forming: number; unclear: number };
}

export interface InsightQualityMetrics {
  averageConfidence: number;
  highQualityCount: number;
}

export interface ConsistencyMetrics {
  consistencyScore: number;
  streakDays: number;
}

export interface GoalOrientedBehavior {
  score: number;
  mentions: number;
}

export interface SocialConnectionMetrics {
  score: number;
  dataPoints: number;
  description: string;
}

export interface CommunicationMetrics {
  score: number;
  description: string;
}

export interface RelationshipMetrics {
  score: number;
  description: string;
}

export interface EnergyIndicators {
  averageLevel: number;
  count: number;
}

export interface SleepIndicators {
  averageQuality: number;
  count: number;
}

export interface ExerciseIndicators {
  frequency: number;
  count: number;
}

export interface HealthAwarenessMetrics {
  score: number;
  description: string;
}

export interface PurposeIndicators {
  score: number;
  dataPoints: number;
  description: string;
}

export interface ValueConnectionMetrics {
  score: number;
  description: string;
}

export interface WellnessDimension {
  name: string;
  score: number;
  trend: 'improving' | 'stable' | 'declining';
  confidence: number;
  lastCalculated: Date;
  contributors: Array<{
    factor: string;
    impact: number;
    weight: number;
    description: string;
  }>;
  recommendations: string[];
}

export interface WellnessMetrics {
  emotional: WellnessDimension;
  cognitive: WellnessDimension;
  behavioral: WellnessDimension;
  social: WellnessDimension;
  physical: WellnessDimension;
  spiritual: WellnessDimension;
}

export interface WellnessTrend {
  date: Date;
  overallScore: number;
  dimensionScores: Record<string, number>;
  significantEvents: Array<{
    type: 'improvement' | 'decline' | 'breakthrough' | 'challenge';
    dimension: string;
    description: string;
    impact: number;
  }>;
  notes?: string;
}

export interface WellnessInsight {
  id: string;
  type: 'pattern' | 'correlation' | 'recommendation' | 'warning' | 'celebration';
  title: string;
  description: string;
  confidence: number;
  urgency: 'low' | 'medium' | 'high';
  category: string;
  actionable: boolean;
  suggestedActions: string[];
  timeframe: string;
  relatedDimensions: string[];
}

export interface CalculateUserWellnessScoreRequest {
  userId: string;
  timeframe?: {
    start: Date;
    end: Date;
  };
  analysisDepth?: 'basic' | 'comprehensive' | 'detailed';
  includeTrends?: boolean;
  includeRecommendations?: boolean;
  includeInsights?: boolean;
  dimensions?: string[];
  compareWithPrevious?: boolean;
  generateAlerts?: boolean;
}

export interface CalculateUserWellnessScoreResponse {
  userId: string;
  overallWellnessScore: number;
  wellnessGrade: 'excellent' | 'good' | 'fair' | 'needs_attention' | 'critical';
  calculatedAt: Date;
  timeframe: {
    start: Date;
    end: Date;
  };
  metrics: WellnessMetrics;
  trends: WellnessTrend[];
  insights: WellnessInsight[];
  summary: {
    strengths: string[];
    concerns: string[];
    keyFindings: string[];
    priorityRecommendations: string[];
  };
  comparison?: {
    previousScore: number;
    change: number;
    changeDescription: string;
    significantChanges: Array<{
      dimension: string;
      previousScore: number;
      currentScore: number;
      change: number;
      explanation: string;
    }>;
  };
  alerts: Array<{
    level: 'info' | 'warning' | 'critical';
    dimension: string;
    message: string;
    actionRequired: boolean;
    suggestedActions: string[];
  }>;
  confidence: {
    overall: number;
    dataQuality: 'excellent' | 'good' | 'fair' | 'limited';
    dataPoints: number;
    timeSpanAdequacy: boolean;
    limitations: string[];
  };
}
