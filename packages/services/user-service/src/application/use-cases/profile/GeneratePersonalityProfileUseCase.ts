import { AnalysisRepository } from '@infrastructure/repositories';
import { getLogger } from '@config/service-urls';
import { ProfileError } from '@application/errors';

const logger = getLogger('generate-personality-profile');

interface EntryHistoryItem {
  id: string;
  content: string;
  createdAt: Date;
  moodContext?: string | null;
  type?: string;
  tags?: string[] | null;
}

interface PersonalityTrait {
  trait: string;
  score: number;
  description: string;
  confidence: number;
}

interface PersonalityAssessment {
  traits: PersonalityTrait[];
  overall: {
    dominantTraits: string[];
    personalityType: string;
    confidence: number;
  };
}

interface PersonalityInsights {
  strengths: string[];
  growthAreas: string[];
  behavioralPatterns: string[];
  communicationStyle: string;
  stressResponses: string[];
  motivationFactors: string[];
}

interface DetectedPattern {
  type: string;
  pattern: string;
  frequency: number;
  confidence: number;
  impact: 'positive' | 'negative' | 'neutral';
  examples: string[];
}

interface AppliedFramework {
  name: string;
  description: string;
  relevanceScore: number;
  insights: string[];
}

interface RecommendedFramework {
  name: string;
  reason: string;
  expectedBenefit: string;
}

export interface GeneratePersonalityProfileRequest {
  userId: string;
  entryHistory?: EntryHistoryItem[];
  analysisDepth: 'basic' | 'detailed' | 'comprehensive';
  includePatternAnalysis?: boolean;
  psychologicalFrameworks?: string[];
}

export interface PsychologicalAnalysisResult {
  userId: string;
  personalityAssessment: {
    traits: Array<{
      trait: string;
      score: number;
      description: string;
      confidence: number;
    }>;
    overall: {
      dominantTraits: string[];
      personalityType: string;
      confidence: number;
    };
  };
  personalityInsights: {
    strengths: string[];
    growthAreas: string[];
    behavioralPatterns: string[];
    communicationStyle: string;
    stressResponses: string[];
    motivationFactors: string[];
  };
  detectedPatterns: Array<{
    type: string;
    pattern: string;
    frequency: number;
    confidence: number;
    impact: 'positive' | 'negative' | 'neutral';
    examples: string[];
  }>;
  appliedFrameworks: Array<{
    name: string;
    description: string;
    relevanceScore: number;
    insights: string[];
  }>;
  recommendedFrameworks: Array<{
    name: string;
    reason: string;
    expectedBenefit: string;
  }>;
  analysisConfidence: number;
  nextSteps: string[];
  generatedAt: Date;
}

export class GeneratePersonalityProfileUseCase {
  constructor(private repository: AnalysisRepository) {}

  async execute(request: GeneratePersonalityProfileRequest): Promise<PsychologicalAnalysisResult> {
    try {
      // Validate request
      this.validateRequest(request);

      logger.warn('Generating personality profile', {
        module: 'generate_personality_profile',
        operation: 'execute',
        userId: request.userId,
        analysisDepth: request.analysisDepth,
        phase: 'profile_generation_started',
      });

      // Get user's entry history if not provided
      const entryHistory = request.entryHistory || (await this.getEntryHistory(request.userId));

      if (entryHistory.length < 5) {
        throw ProfileError.insufficientData(
          'Insufficient data for psychological analysis. Minimum 5 entries required.',
          5
        );
      }

      // Perform personality assessment based on entry patterns
      const personalityAssessment = await this.assessPersonality(entryHistory, request.analysisDepth);

      // Generate personality insights
      const personalityInsights = await this.generatePersonalityInsights(personalityAssessment, entryHistory);

      // Detect entry patterns if requested
      const detectedPatterns = request.includePatternAnalysis
        ? await this.detectEntryPatterns(request.userId, entryHistory)
        : [];

      // Apply psychological frameworks
      const appliedFrameworks = request.psychologicalFrameworks
        ? await this.applyFrameworks(request.psychologicalFrameworks, entryHistory, personalityAssessment)
        : await this.selectAndApplyFrameworks(entryHistory, personalityAssessment);

      // Recommend additional frameworks
      const recommendedFrameworks = await this.recommendFrameworks(personalityAssessment, appliedFrameworks);

      // Calculate overall analysis confidence
      const analysisConfidence = this.calculateAnalysisConfidence(
        entryHistory.length,
        personalityAssessment.overall.confidence,
        detectedPatterns.length
      );

      // Generate next steps for member
      const nextSteps = await this.generateNextSteps(personalityAssessment, personalityInsights, detectedPatterns);

      // Record analytics event
      await this.repository.recordAnalyticsEvent({
        userId: request.userId,
        eventType: 'member_profile_generated',
        eventData: {
          analysisDepth: request.analysisDepth,
          entryCount: entryHistory.length,
          patternsDetected: detectedPatterns.length,
          frameworksApplied: appliedFrameworks.length,
          analysisConfidence,
        },
      });

      return {
        userId: request.userId,
        personalityAssessment,
        personalityInsights,
        detectedPatterns,
        appliedFrameworks,
        recommendedFrameworks,
        analysisConfidence,
        nextSteps,
        generatedAt: new Date(),
      };
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      throw ProfileError.internalError(
        'Failed to analyze member psychology',
        error instanceof Error ? error : undefined
      );
    }
  }

  private validateRequest(request: GeneratePersonalityProfileRequest): void {
    if (!request.userId?.trim()) {
      throw ProfileError.userIdRequired();
    }

    if (!['basic', 'detailed', 'comprehensive'].includes(request.analysisDepth)) {
      throw ProfileError.invalidDepth(request.analysisDepth);
    }
  }

  private async getEntryHistory(userId: string): Promise<EntryHistoryItem[]> {
    const entries = await this.repository.getEntriesByUser(userId, {
      isArchived: false,
    });

    return entries.slice(-50); // Get last 50 entries for analysis
  }

  private async assessPersonality(
    entryHistory: EntryHistoryItem[],
    analysisDepth: string
  ): Promise<PersonalityAssessment> {
    const traits = await this.analyzePersonalityTraits(entryHistory);

    // Determine dominant traits
    const dominantTraits = traits
      .filter(t => t.score > 0.7)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(t => t.trait);

    // Assign personality type based on dominant traits
    const personalityType = this.determinePersonalityType(dominantTraits, traits);

    // Calculate overall confidence
    const confidence = this.calculateOverallConfidence(traits, entryHistory.length);

    return {
      traits,
      overall: {
        dominantTraits,
        personalityType,
        confidence,
      },
    };
  }

  private async analyzePersonalityTraits(entryHistory: EntryHistoryItem[]): Promise<PersonalityTrait[]> {
    // Mock implementation - in real system this would use AI/ML analysis
    const traitScores = {
      openness: 0.75,
      conscientiousness: 0.65,
      extraversion: 0.55,
      agreeableness: 0.8,
      neuroticism: 0.35,
    };

    return Object.entries(traitScores).map(([trait, score]) => ({
      trait,
      score,
      description: this.getTraitDescription(trait, score),
      confidence: Math.min(0.95, 0.5 + entryHistory.length * 0.01),
    }));
  }

  private getTraitDescription(trait: string, score: number): string {
    const descriptions: Record<string, string> = {
      openness: score > 0.7 ? 'Highly creative and open to new experiences' : 'Prefers familiar routines and concepts',
      conscientiousness: score > 0.7 ? 'Organized and goal-oriented' : 'More spontaneous and flexible',
      extraversion: score > 0.7 ? 'Energized by social interaction' : 'Prefers solitude and reflection',
      agreeableness: score > 0.7 ? 'Cooperative and trusting' : 'More competitive and skeptical',
      neuroticism: score > 0.7 ? 'Prone to stress and emotional instability' : 'Emotionally stable and resilient',
    };
    return descriptions[trait] || 'No description available';
  }

  private determinePersonalityType(dominantTraits: string[], _allTraits: PersonalityTrait[]): string {
    // Simple personality type assignment based on dominant traits
    if (dominantTraits.includes('openness') && dominantTraits.includes('extraversion')) {
      return 'Creative Explorer';
    } else if (dominantTraits.includes('conscientiousness') && dominantTraits.includes('agreeableness')) {
      return 'Harmonious Achiever';
    } else if (dominantTraits.includes('openness') && !dominantTraits.includes('extraversion')) {
      return 'Reflective Innovator';
    } else {
      return 'Balanced Individual';
    }
  }

  private calculateOverallConfidence(traits: PersonalityTrait[], entryCount: number): number {
    const avgTraitConfidence = traits.reduce((sum, t) => sum + t.confidence, 0) / traits.length;
    const dataConfidence = Math.min(1.0, entryCount / 50);
    return Math.round((avgTraitConfidence * 0.7 + dataConfidence * 0.3) * 100) / 100;
  }

  private async generatePersonalityInsights(
    personalityAssessment: PersonalityAssessment,
    _entryHistory: EntryHistoryItem[]
  ): Promise<PersonalityInsights> {
    // Mock implementation - would use real analysis in production
    return {
      strengths: ['Self-awareness', 'Analytical thinking', 'Emotional intelligence'],
      growthAreas: ['Time management', 'Stress management', 'Communication clarity'],
      behavioralPatterns: ['Regular reflection patterns', 'Goal-oriented thinking', 'Problem-solving approach'],
      communicationStyle: 'Thoughtful and considered',
      stressResponses: ['Tends to overthink', 'Seeks social support', 'Uses reflection to cope'],
      motivationFactors: ['Personal growth', 'Achievement', 'Connection with others'],
    };
  }

  private async detectEntryPatterns(_userId: string, _entryHistory: EntryHistoryItem[]): Promise<DetectedPattern[]> {
    // Mock pattern detection - would use real ML in production
    return [
      {
        type: 'emotional',
        pattern: 'Morning reflection routine',
        frequency: 0.8,
        confidence: 0.75,
        impact: 'positive' as const,
        examples: ['Daily morning entries', 'Goal-setting patterns'],
      },
      {
        type: 'cognitive',
        pattern: 'Problem-solving approach',
        frequency: 0.6,
        confidence: 0.7,
        impact: 'positive' as const,
        examples: ['Systematic thinking', 'Solution-oriented mindset'],
      },
    ];
  }

  private async applyFrameworks(
    frameworks: string[],
    _entryHistory: EntryHistoryItem[],
    _personalityAssessment: PersonalityAssessment
  ): Promise<AppliedFramework[]> {
    // Mock framework application
    return frameworks.map(name => ({
      name,
      description: `Applied ${name} framework to thought analysis`,
      relevanceScore: 0.8,
      insights: [`${name} analysis reveals consistent patterns`, `Growth opportunities identified through ${name}`],
    }));
  }

  private async selectAndApplyFrameworks(
    entryHistory: EntryHistoryItem[],
    personalityAssessment: PersonalityAssessment
  ): Promise<AppliedFramework[]> {
    // Auto-select relevant frameworks based on personality
    const frameworks = ['Big Five', 'Cognitive Behavioral', 'Mindfulness'];
    return this.applyFrameworks(frameworks, entryHistory, personalityAssessment);
  }

  private async recommendFrameworks(
    personalityAssessment: PersonalityAssessment,
    appliedFrameworks: AppliedFramework[]
  ): Promise<RecommendedFramework[]> {
    return [
      {
        name: 'Positive Psychology',
        reason: 'High agreeableness score suggests benefit from strengths-focused approaches',
        expectedBenefit: 'Enhanced well-being and resilience',
      },
      {
        name: 'Growth Mindset',
        reason: 'High openness indicates readiness for continuous learning',
        expectedBenefit: 'Accelerated personal development',
      },
    ];
  }

  private calculateAnalysisConfidence(entryCount: number, assessmentConfidence: number, patternCount: number): number {
    const dataQuality = Math.min(1.0, entryCount / 30);
    const assessmentQuality = assessmentConfidence;
    const patternQuality = Math.min(1.0, patternCount / 5);

    return Math.round((dataQuality * 0.4 + assessmentQuality * 0.4 + patternQuality * 0.2) * 100) / 100;
  }

  private async generateNextSteps(
    personalityAssessment: PersonalityAssessment,
    insights: PersonalityInsights,
    patterns: DetectedPattern[]
  ): Promise<string[]> {
    return [
      'Continue regular reflection to maintain analysis accuracy',
      'Focus on identified growth areas for personal development',
      'Apply recommended frameworks to enhance self-understanding',
      'Track progress in dominant personality traits over time',
    ];
  }
}
