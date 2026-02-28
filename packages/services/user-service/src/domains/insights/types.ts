export interface Insight {
  id: string;
  userId: string;
  entryId: string | null;
  type: string;
  title: string;
  content: string;
  confidence: string | null;
  category: string | null;
  themes: string[] | null;
  actionable: boolean | null;
  priority: number | null;
  aiProvider: string | null;
  aiModel: string | null;
  generatedAt: Date;
  validatedAt: Date | null;
  validatedBy: string | null;
  metadata: unknown;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface NewInsight {
  id?: string;
  userId: string;
  entryId?: string | null;
  type: string;
  title: string;
  content: string;
  confidence?: string | null;
  category?: string | null;
  themes?: string[] | null;
  actionable?: boolean | null;
  priority?: number | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  generatedAt?: Date;
  validatedAt?: Date | null;
  validatedBy?: string | null;
  metadata?: unknown;
  createdAt?: Date;
}

export interface Reflection {
  id: string;
  userId: string;
  challengeQuestion: string;
  userResponse: string | null;
  followUpQuestions: string[] | null;
  isBreakthrough: boolean | null;
  engagementLevel: number | null;
  responseTime: number | null;
  submittedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface NewReflection {
  id?: string;
  userId: string;
  challengeQuestion: string;
  userResponse?: string | null;
  followUpQuestions?: string[] | null;
  isBreakthrough?: boolean | null;
  engagementLevel?: number | null;
  responseTime?: number | null;
  submittedAt?: Date | null;
  createdAt?: Date;
}

export interface ReflectionTurn {
  id: string;
  reflectionId: string;
  turnNumber: number;
  question: string;
  response: string | null;
  microInsight: string | null;
  therapeuticFramework: string | null;
  respondedAt: Date | null;
  createdAt: Date;
}

export interface NewReflectionTurn {
  reflectionId: string;
  turnNumber: number;
  question: string;
  response?: string | null;
  microInsight?: string | null;
  therapeuticFramework?: string | null;
  respondedAt?: Date | null;
}

export interface UserPattern {
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
  evidenceEntryIds: string[] | null;
  explorationPrompt: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewUserPattern {
  id?: string;
  userId: string;
  patternType: string;
  patternName: string;
  description?: string | null;
  frequency?: number | null;
  strength?: string | null;
  trend?: string | null;
  firstObserved?: Date;
  lastObserved?: Date;
  relatedThemes?: string[] | null;
  triggerFactors?: string[] | null;
  isActive?: boolean | null;
  evidenceEntryIds?: string[] | null;
  explorationPrompt?: string | null;
  metadata?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PatternReaction {
  id: string;
  userId: string;
  patternId: string;
  reaction: string;
  explanation: string | null;
  followUpReflectionId: string | null;
  generatedInsightId: string | null;
  createdAt: Date;
}

export interface NewPatternReaction {
  userId: string;
  patternId: string;
  reaction: string;
  explanation?: string | null;
  followUpReflectionId?: string | null;
  generatedInsightId?: string | null;
}

export interface MoodCheckin {
  id: string;
  userId: string;
  mood: string;
  emotionalIntensity: number;
  content: string | null;
  triggerTag: string | null;
  microQuestion: string | null;
  microQuestionResponse: string | null;
  patternConnectionId: string | null;
  linkedReflectionId: string | null;
  respondedAt: Date | null;
  createdAt: Date;
}

export interface NewMoodCheckin {
  userId: string;
  mood: string;
  emotionalIntensity: number;
  content?: string | null;
  triggerTag?: string | null;
  microQuestion?: string | null;
  microQuestionResponse?: string | null;
  patternConnectionId?: string | null;
  linkedReflectionId?: string | null;
  respondedAt?: Date | null;
}

export interface PersonalNarrative {
  id: string;
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  narrative: string;
  dataPointsUsed: number;
  breakthroughsReferenced: string[] | null;
  forwardPrompt: string | null;
  userReflection: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface NewPersonalNarrative {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  narrative: string;
  dataPointsUsed?: number;
  breakthroughsReferenced?: string[] | null;
  forwardPrompt?: string | null;
  userReflection?: string | null;
  metadata?: unknown;
}

export interface ProfileAnalytics {
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

export interface Persona {
  id: string;
  userId: string;
  personaName: string;
  personaDescription: string | null;
  personality: unknown;
  behavior: unknown;
  cognitive: unknown;
  social: unknown;
  growth: unknown;
  confidence: string;
  dataPoints: number;
  version: string;
  sourceTimeframeStart: Date | null;
  sourceTimeframeEnd: Date | null;
  isActive: boolean;
  generatedAt: Date;
  updatedAt: Date;
}

export interface InsertPersona {
  id?: string;
  userId: string;
  personaName: string;
  personaDescription?: string | null;
  personality: unknown;
  behavior: unknown;
  cognitive: unknown;
  social: unknown;
  growth: unknown;
  confidence: string;
  dataPoints?: number;
  version?: string;
  sourceTimeframeStart?: Date | null;
  sourceTimeframeEnd?: Date | null;
  isActive?: boolean;
  generatedAt?: Date;
  updatedAt?: Date;
}
