export interface MusicFrameworkMetadata {
  id: string;
  name: string;
  shortName: string;
  keyPrinciples: string[];
  therapeuticGoals: string[];
  songStructureHint?: string;
  confidence: 'high' | 'medium' | 'low';
  matchedPatterns?: string[];
}

export interface MusicTemplateExecutionRequest {
  templateId?: string;
  musicType: 'song' | 'instrumental' | 'jingle' | 'background' | 'soundtrack' | 'loop';
  userInput: string;
  parameters?: {
    style?: string;
    genre?: string;
    mood?: string;
    tempo?: number;
    key?: string;
    duration?: number;
    culturalStyle?: string;
    instrumentType?: string;
    wellbeingPurpose?: string;
    [key: string]: string | number | undefined;
  };
  context?: {
    userId?: string;
    sessionId?: string;
    culturalContext?: string;
    therapeuticFramework?: string;
    frameworkMetadata?: MusicFrameworkMetadata;
    supportingFrameworks?: MusicFrameworkMetadata[];
    detectedEmotions?: string[];
    detectedThemes?: string[];
    therapeuticApproach?: string;
    songStructureGuidance?: string;
    emotionalState?: string;
    userProfile?: Record<string, unknown>;
    sessionHistory?: Record<string, unknown>;
  };
  fallbackToDefault?: boolean;
}

export interface MusicTemplateExecutionResult {
  success: boolean;
  systemPrompt?: string;
  userPrompt?: string;
  enhancedPrompt?: string;
  templateUsed?: string;
  culturalAdaptations: string[];
  therapeuticInterventions: string[];
  processingTimeMs: number;
  qualityScore?: number;
  musicParameters?: Record<string, unknown>;
  error?: string;
  warnings: string[];
}

export interface ITemplateServiceClient {
  executeMusicTemplate(request: MusicTemplateExecutionRequest): Promise<MusicTemplateExecutionResult>;
}
