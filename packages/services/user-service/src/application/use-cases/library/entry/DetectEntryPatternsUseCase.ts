import { AnalysisRepository } from '@infrastructure/repositories';
import { ProfileError } from '@application/errors';
import { getLogger } from '@config/service-urls';
import { serializeError } from '@aiponge/platform-core';
import { GetNarrativeSeedsUseCase, NarrativeSeed } from '../../insights/GetNarrativeSeedsUseCase';

const logger = getLogger('user-service-detectentrypatternsusecase');

interface EntryHistoryItem {
  id: string;
  content: string;
  createdAt: Date;
  moodContext?: string | null;
  type?: string;
  tags?: string[] | null;
}

interface PatternOccurrence {
  id: string;
  content: string;
  createdAt: Date;
}

interface DetectedPattern {
  id: string;
  type: string;
  pattern: {
    name: string;
    description: string;
    strength: 'weak' | 'moderate' | 'strong';
    frequency: number;
    occurrences: PatternOccurrence[];
  };
  confidence: number;
  impact: 'positive' | 'negative' | 'neutral';
  recommendation: string;
  examples: string[];
}

export interface DetectEntryPatternsRequest {
  userId: string;
  entryHistory?: EntryHistoryItem[];
  timeWindow?: {
    start: Date;
    end: Date;
  };
  patternTypes?: string[]; // ['cognitive', 'emotional', 'behavioral', 'temporal']
  minConfidence?: number;
}

export interface PatternDetectionResult {
  userId: string;
  detectedPatterns: DetectedPattern[];
  patternSummary: {
    totalPatterns: number;
    strongPatterns: number;
    positivePatterns: number;
    negativePatterns: number;
    mostSignificantPattern: DetectedPattern | null;
  };
  recommendations: string[];
  nextAnalysisDate: Date;
  confidenceScore: number;
}

export class DetectEntryPatternsUseCase {
  constructor(
    private repository: AnalysisRepository,
    private narrativeSeedsUseCase?: GetNarrativeSeedsUseCase
  ) {}

  async execute(request: DetectEntryPatternsRequest): Promise<PatternDetectionResult> {
    try {
      this.validateRequest(request);

      logger.warn('Analyzing patterns for user {}', { data0: request.userId });

      const entryHistory = request.entryHistory || (await this.getEntryHistory(request.userId, request.timeWindow));

      if (entryHistory.length < 3) {
        throw ProfileError.businessRuleViolation(
          'Insufficient data for pattern detection. Minimum 3 entries required.'
        );
      }

      let userSeeds: NarrativeSeed[] = [];
      if (this.narrativeSeedsUseCase) {
        try {
          const seedsResult = await this.narrativeSeedsUseCase.execute({
            userId: request.userId,
            maxSeeds: 15,
            timeframeDays: 30,
          });
          userSeeds = seedsResult.seeds;
        } catch (error) {
          logger.warn('Failed to fetch narrative seeds for personalization', { error });
        }
      }

      const detectedPatterns = await this.detectAllPatterns(
        request.userId,
        entryHistory,
        request.patternTypes || ['cognitive', 'emotional', 'behavioral', 'temporal'],
        request.minConfidence || 0.6,
        userSeeds
      );

      const patternSummary = this.generatePatternSummary(detectedPatterns);
      const recommendations = await this.generateRecommendations(detectedPatterns);
      const confidenceScore = this.calculateOverallConfidence(detectedPatterns, entryHistory.length);
      const nextAnalysisDate = this.calculateNextAnalysisDate(detectedPatterns);

      await this.repository.recordAnalyticsEvent({
        userId: request.userId,
        eventType: 'pattern_detection_completed',
        eventData: {
          patternsDetected: detectedPatterns.length,
          patternTypes: request.patternTypes || ['cognitive', 'emotional', 'behavioral', 'temporal'],
          confidenceScore,
          entriesAnalyzed: entryHistory.length,
        },
      });

      return {
        userId: request.userId,
        detectedPatterns,
        patternSummary,
        recommendations,
        nextAnalysisDate,
        confidenceScore,
      };
    } catch (error) {
      if (error instanceof ProfileError) {
        throw error;
      }
      throw ProfileError.businessRuleViolation(
        `Failed to detect entry patterns: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  personalizePatternName(defaultName: string, patternType: string, seeds: NarrativeSeed[]): string {
    if (seeds.length === 0) return defaultName;

    const relevantSeeds = seeds.filter(s => {
      if (patternType === 'emotional') return s.source === 'mood' || s.source === 'sentiment';
      if (patternType === 'cognitive') return s.source === 'content';
      if (patternType === 'behavioral') return s.source === 'content' || s.source === 'tag';
      if (patternType === 'temporal') return s.source === 'content';
      return false;
    });

    const topSeed = relevantSeeds.length > 0 ? relevantSeeds[0] : seeds[0];
    if (!topSeed) return defaultName;

    const keyword = topSeed.keyword.charAt(0).toUpperCase() + topSeed.keyword.slice(1);

    const personalizedNames: Record<string, Record<string, string>> = {
      cognitive: {
        'Causal Reasoning': `Your "${keyword}" thinking pattern`,
        'Curious Inquiry': `Exploring "${keyword}" and beyond`,
      },
      emotional: {
        'Positive Emotional Expression': `Your "${keyword}" energy`,
        'Processing Challenging Emotions': `Working through "${keyword}"`,
      },
      behavioral: {
        'Action-Oriented Thinking': `Moving toward "${keyword}"`,
        'Habit Awareness': `Your "${keyword}" habit loop`,
      },
      temporal: {
        'Temporal Awareness': `Your sense of "${keyword}" timing`,
        'Future-Oriented Thinking': `Dreaming about "${keyword}"`,
      },
    };

    return personalizedNames[patternType]?.[defaultName] || `Your "${keyword}" pattern`;
  }

  private validateRequest(request: DetectEntryPatternsRequest): void {
    if (!request.userId?.trim()) {
      throw ProfileError.validationError('userId', 'User ID is required');
    }

    if (request.minConfidence && (request.minConfidence < 0 || request.minConfidence > 1)) {
      throw ProfileError.validationError('minConfidence', 'Min confidence must be between 0 and 1');
    }

    if (request.timeWindow) {
      const { start, end } = request.timeWindow;
      if (start >= end) {
        throw ProfileError.validationError('timeWindow', 'Start date must be before end date');
      }
    }
  }

  private async getEntryHistory(userId: string, timeWindow?: { start: Date; end: Date }): Promise<EntryHistoryItem[]> {
    const entries = await this.repository.getEntriesByUser(userId, {
      dateFrom: timeWindow?.start,
      dateTo: timeWindow?.end,
      isArchived: false,
    });

    return entries.slice(-100);
  }

  private async detectAllPatterns(
    _userId: string,
    entryHistory: EntryHistoryItem[],
    patternTypes: string[],
    minConfidence: number,
    seeds: NarrativeSeed[]
  ): Promise<DetectedPattern[]> {
    const allPatterns = [];

    for (const patternType of patternTypes) {
      try {
        const patterns = await this.detectPatternsByType(patternType, entryHistory, minConfidence);
        for (const pattern of patterns) {
          pattern.pattern.name = this.personalizePatternName(pattern.pattern.name, pattern.type, seeds);
        }
        allPatterns.push(...patterns);
      } catch (error) {
        logger.warn('Failed to detect ${patternType} patterns:', { data: error });
      }
    }

    return allPatterns;
  }

  private async detectPatternsByType(
    patternType: string,
    entryHistory: EntryHistoryItem[],
    minConfidence: number
  ): Promise<DetectedPattern[]> {
    switch (patternType) {
      case 'cognitive':
        return this.detectCognitivePatterns(entryHistory, minConfidence);
      case 'emotional':
        return this.detectEmotionalPatterns(entryHistory, minConfidence);
      case 'behavioral':
        return this.detectBehavioralPatterns(entryHistory, minConfidence);
      case 'temporal':
        return this.detectTemporalPatterns(entryHistory, minConfidence);
      default:
        logger.warn('Unknown pattern type: {}', { data0: patternType });
        return [];
    }
  }

  private detectCognitivePatterns(entryHistory: EntryHistoryItem[], minConfidence: number): DetectedPattern[] {
    const patterns = [];

    const reasoningWords = ['because', 'therefore', 'since', 'as a result', 'consequently'];
    const reasoningOccurrences = entryHistory.filter(entry =>
      reasoningWords.some(word => entry.content.toLowerCase().includes(word))
    );

    if (reasoningOccurrences.length >= 3) {
      const frequency = reasoningOccurrences.length / entryHistory.length;
      const confidence = Math.min(frequency * 2, 1);

      if (confidence >= minConfidence) {
        patterns.push({
          id: `cognitive_reasoning_${Date.now()}`,
          type: 'cognitive',
          pattern: {
            name: 'Causal Reasoning',
            description: 'Tendency to think in terms of cause and effect relationships',
            strength: this.categorizeStrength(frequency),
            frequency: reasoningOccurrences.length,
            occurrences: reasoningOccurrences.slice(0, 5),
          },
          confidence,
          impact: 'positive' as const,
          recommendation: 'Continue developing your analytical thinking while balancing with intuitive insights',
          examples: reasoningOccurrences.slice(0, 3).map(t => t.content.substring(0, 100) + '...'),
        });
      }
    }

    const questioningOccurrences = entryHistory.filter(
      entry =>
        entry.content.includes('?') ||
        entry.content.toLowerCase().includes('wonder') ||
        entry.content.toLowerCase().includes('curious')
    );

    if (questioningOccurrences.length >= 2) {
      const frequency = questioningOccurrences.length / entryHistory.length;
      const confidence = Math.min(frequency * 1.5, 1);

      if (confidence >= minConfidence) {
        patterns.push({
          id: `cognitive_questioning_${Date.now()}`,
          type: 'cognitive',
          pattern: {
            name: 'Curious Inquiry',
            description: 'Pattern of asking questions and seeking understanding',
            strength: this.categorizeStrength(frequency),
            frequency: questioningOccurrences.length,
            occurrences: questioningOccurrences.slice(0, 5),
          },
          confidence,
          impact: 'positive' as const,
          recommendation: 'Your questioning nature is a strength - consider exploring formal learning opportunities',
          examples: questioningOccurrences.slice(0, 3).map(t => t.content.substring(0, 100) + '...'),
        });
      }
    }

    return patterns;
  }

  private detectEmotionalPatterns(entryHistory: EntryHistoryItem[], minConfidence: number): DetectedPattern[] {
    const patterns = [];

    const positiveWords = ['happy', 'excited', 'grateful', 'joy', 'love', 'peaceful', 'content'];
    const negativeWords = ['sad', 'angry', 'frustrated', 'anxious', 'worried', 'stressed', 'disappointed'];

    const positiveOccurrences = entryHistory.filter(entry =>
      positiveWords.some(word => entry.content.toLowerCase().includes(word))
    );

    const negativeOccurrences = entryHistory.filter(entry =>
      negativeWords.some(word => entry.content.toLowerCase().includes(word))
    );

    if (positiveOccurrences.length >= 2) {
      const frequency = positiveOccurrences.length / entryHistory.length;
      const confidence = Math.min(frequency * 1.2, 1);

      if (confidence >= minConfidence) {
        patterns.push({
          id: `emotional_positive_${Date.now()}`,
          type: 'emotional',
          pattern: {
            name: 'Positive Emotional Expression',
            description: 'Consistent use of positive emotional language',
            strength: this.categorizeStrength(frequency),
            frequency: positiveOccurrences.length,
            occurrences: positiveOccurrences.slice(0, 5),
          },
          confidence,
          impact: 'positive' as const,
          recommendation: 'Continue nurturing this positive emotional outlook while staying authentic to all feelings',
          examples: positiveOccurrences.slice(0, 3).map(t => t.content.substring(0, 100) + '...'),
        });
      }
    }

    if (negativeOccurrences.length >= 3) {
      const frequency = negativeOccurrences.length / entryHistory.length;
      const confidence = Math.min(frequency * 1.5, 1);

      if (confidence >= minConfidence) {
        patterns.push({
          id: `emotional_challenging_${Date.now()}`,
          type: 'emotional',
          pattern: {
            name: 'Processing Challenging Emotions',
            description: 'Pattern of working through difficult emotional experiences',
            strength: this.categorizeStrength(frequency),
            frequency: negativeOccurrences.length,
            occurrences: negativeOccurrences.slice(0, 5),
          },
          confidence,
          impact: (frequency > 0.6 ? 'negative' : 'neutral') as 'negative' | 'neutral',
          recommendation: 'Consider developing emotional regulation strategies and seeking support when needed',
          examples: negativeOccurrences.slice(0, 3).map(t => t.content.substring(0, 100) + '...'),
        });
      }
    }

    return patterns;
  }

  private detectBehavioralPatterns(entryHistory: EntryHistoryItem[], minConfidence: number): DetectedPattern[] {
    const patterns = [];

    const actionWords = ['will', 'going to', 'plan to', 'decide', 'choose', 'commit', 'start', 'begin'];
    const actionOccurrences = entryHistory.filter(entry =>
      actionWords.some(word => entry.content.toLowerCase().includes(word))
    );

    if (actionOccurrences.length >= 2) {
      const frequency = actionOccurrences.length / entryHistory.length;
      const confidence = Math.min(frequency * 1.3, 1);

      if (confidence >= minConfidence) {
        patterns.push({
          id: `behavioral_action_${Date.now()}`,
          type: 'behavioral',
          pattern: {
            name: 'Action-Oriented Thinking',
            description: 'Tendency to think in terms of actions and decisions',
            strength: this.categorizeStrength(frequency),
            frequency: actionOccurrences.length,
            occurrences: actionOccurrences.slice(0, 5),
          },
          confidence,
          impact: 'positive' as const,
          recommendation:
            'Your action-oriented mindset is valuable - consider setting specific timelines for your plans',
          examples: actionOccurrences.slice(0, 3).map(t => t.content.substring(0, 100) + '...'),
        });
      }
    }

    const habitWords = ['always', 'never', 'usually', 'tend to', 'habit', 'routine', 'often', 'rarely'];
    const habitOccurrences = entryHistory.filter(entry =>
      habitWords.some(word => entry.content.toLowerCase().includes(word))
    );

    if (habitOccurrences.length >= 2) {
      const frequency = habitOccurrences.length / entryHistory.length;
      const confidence = Math.min(frequency * 1.2, 1);

      if (confidence >= minConfidence) {
        patterns.push({
          id: `behavioral_habits_${Date.now()}`,
          type: 'behavioral',
          pattern: {
            name: 'Habit Awareness',
            description: 'Recognition of behavioral patterns and routines',
            strength: this.categorizeStrength(frequency),
            frequency: habitOccurrences.length,
            occurrences: habitOccurrences.slice(0, 5),
          },
          confidence,
          impact: 'neutral' as const,
          recommendation: 'Use your habit awareness to consciously reinforce positive patterns',
          examples: habitOccurrences.slice(0, 3).map(t => t.content.substring(0, 100) + '...'),
        });
      }
    }

    return patterns;
  }

  private detectTemporalPatterns(entryHistory: EntryHistoryItem[], minConfidence: number): DetectedPattern[] {
    const patterns = [];

    const timeWords = ['tomorrow', 'yesterday', 'today', 'future', 'past', 'now', 'later', 'before', 'after'];
    const timeOccurrences = entryHistory.filter(entry =>
      timeWords.some(word => entry.content.toLowerCase().includes(word))
    );

    if (timeOccurrences.length >= 3) {
      const frequency = timeOccurrences.length / entryHistory.length;
      const confidence = Math.min(frequency * 1.1, 1);

      if (confidence >= minConfidence) {
        patterns.push({
          id: `temporal_awareness_${Date.now()}`,
          type: 'temporal',
          pattern: {
            name: 'Temporal Awareness',
            description: 'Active consideration of time and temporal relationships',
            strength: this.categorizeStrength(frequency),
            frequency: timeOccurrences.length,
            occurrences: timeOccurrences.slice(0, 5),
          },
          confidence,
          impact: 'positive' as const,
          recommendation: 'Your time awareness can help with planning and living intentionally',
          examples: timeOccurrences.slice(0, 3).map(t => t.content.substring(0, 100) + '...'),
        });
      }
    }

    const futureWords = ['will', 'going to', 'hope', 'dream', 'goal', 'plan', 'vision'];
    const futureOccurrences = entryHistory.filter(entry =>
      futureWords.some(word => entry.content.toLowerCase().includes(word))
    );

    if (futureOccurrences.length >= 2) {
      const frequency = futureOccurrences.length / entryHistory.length;
      const confidence = Math.min(frequency * 1.2, 1);

      if (confidence >= minConfidence) {
        patterns.push({
          id: `temporal_future_${Date.now()}`,
          type: 'temporal',
          pattern: {
            name: 'Future-Oriented Thinking',
            description: 'Focus on future possibilities and planning',
            strength: this.categorizeStrength(frequency),
            frequency: futureOccurrences.length,
            occurrences: futureOccurrences.slice(0, 5),
          },
          confidence,
          impact: 'positive' as const,
          recommendation: 'Balance your future focus with present-moment awareness',
          examples: futureOccurrences.slice(0, 3).map(t => t.content.substring(0, 100) + '...'),
        });
      }
    }

    return patterns;
  }

  private categorizeStrength(frequency: number): 'weak' | 'moderate' | 'strong' {
    if (frequency >= 0.4) return 'strong';
    if (frequency >= 0.2) return 'moderate';
    return 'weak';
  }

  private generatePatternSummary(patterns: DetectedPattern[]) {
    const strongPatterns = patterns.filter(p => p.pattern.strength === 'strong').length;
    const positivePatterns = patterns.filter(p => p.impact === 'positive').length;
    const negativePatterns = patterns.filter(p => p.impact === 'negative').length;

    const mostSignificantPattern =
      patterns.length > 0
        ? patterns.reduce((max, pattern) => (pattern.confidence > max.confidence ? pattern : max))
        : null;

    return {
      totalPatterns: patterns.length,
      strongPatterns,
      positivePatterns,
      negativePatterns,
      mostSignificantPattern,
    };
  }

  private async generateRecommendations(patterns: DetectedPattern[]): Promise<string[]> {
    const recommendations = [];

    const patternRecommendations = patterns.map(p => p.recommendation);
    recommendations.push(...Array.from(new Set(patternRecommendations)));

    const hasPositivePatterns = patterns.some(p => p.impact === 'positive');
    const hasNegativePatterns = patterns.some(p => p.impact === 'negative');
    const strongPatternCount = patterns.filter(p => p.pattern.strength === 'strong').length;

    if (hasPositivePatterns && !hasNegativePatterns) {
      recommendations.push('Continue building on these positive thinking patterns');
    }

    if (hasNegativePatterns) {
      recommendations.push('Consider strategies to address challenging patterns while honoring their insights');
    }

    if (strongPatternCount >= 2) {
      recommendations.push('Your thinking patterns are well-established - use this awareness for intentional growth');
    }

    if (patterns.length === 0) {
      recommendations.push('Continue collecting entries to enable more detailed pattern analysis');
    }

    return recommendations.slice(0, 5);
  }

  private calculateOverallConfidence(patterns: DetectedPattern[], entryCount: number): number {
    if (patterns.length === 0) return 0.3;

    const avgPatternConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;

    const dataFactor = Math.min(entryCount / 20, 1);

    return Math.round(avgPatternConfidence * dataFactor * 100) / 100;
  }

  private calculateNextAnalysisDate(patterns: DetectedPattern[]): Date {
    const nextDate = new Date();

    const strongPatterns = patterns.filter(p => p.pattern.strength === 'strong').length;
    const daysToAdd = strongPatterns >= 2 ? 14 : 7;

    nextDate.setDate(nextDate.getDate() + daysToAdd);
    return nextDate;
  }
}
