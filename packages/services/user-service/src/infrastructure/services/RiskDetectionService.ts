/**
 * Risk Detection Service
 * Analyzes user content for distress patterns and crisis keywords
 * Automatically creates risk flags when concerning content is detected
 */

import { SafetyRepository } from '../repositories/SafetyRepository';
import { RiskSeverity } from '../database/schemas/profile-schema';
import { ContentServiceClient } from '../clients/ContentServiceClient';
import { getLogger } from '../../config/service-urls';
import { serializeError } from '@aiponge/platform-core';

const logger = getLogger('risk-detection-service');

interface RiskIndicator {
  pattern: RegExp;
  severity: RiskSeverity;
  type: string;
  description: string;
}

interface DetectionResult {
  detected: boolean;
  severity: RiskSeverity | null;
  type: string | null;
  description: string | null;
  matchedPatterns: string[];
  aiConfidence?: number;
  flagId?: string;
}

interface AnalysisInput {
  content: string;
  userId: string;
  sourceType: 'entry' | 'book' | 'reflection' | 'chat';
  sourceId: string;
  skipAI?: boolean;
}

const CRISIS_KEYWORDS: RiskIndicator[] = [
  {
    pattern: /\b(suicid(e|al)|kill\s*(my)?self|end\s*(my\s*)?life|don'?t\s*want\s*to\s*live)\b/i,
    severity: 'crisis',
    type: 'self_harm_ideation',
    description: 'Content contains indicators of self-harm ideation or suicidal content',
  },
  {
    pattern: /\b(want\s*to\s*die|better\s*off\s*dead|no\s*reason\s*to\s*live)\b/i,
    severity: 'crisis',
    type: 'self_harm_ideation',
    description: 'Content contains indicators of death wish or hopelessness',
  },
  {
    pattern: /\b(hurt\s*(my)?self|self[\s-]?harm|cutting|burning\s*myself)\b/i,
    severity: 'high',
    type: 'self_harm_behavior',
    description: 'Content mentions self-harm behaviors',
  },
  {
    pattern: /\b(hate\s*(my)?self|worthless|hopeless|nobody\s*cares)\b/i,
    severity: 'medium',
    type: 'negative_self_perception',
    description: 'Content shows severe negative self-perception',
  },
  {
    pattern: /\b(abuse|violence|assault|hurt\s*by)\b/i,
    severity: 'high',
    type: 'abuse_indicator',
    description: 'Content mentions potential abuse or violence',
  },
  {
    pattern: /\b(can'?t\s*cope|overwhelmed|breaking\s*down|falling\s*apart)\b/i,
    severity: 'medium',
    type: 'emotional_distress',
    description: 'Content indicates significant emotional distress',
  },
  {
    pattern: /\b(panic\s*attack|anxiety\s*attack|can'?t\s*breathe|terrified)\b/i,
    severity: 'medium',
    type: 'acute_anxiety',
    description: 'Content indicates acute anxiety or panic',
  },
  {
    pattern: /\b(eating\s*disorder|starving\s*myself|binge|purge)\b/i,
    severity: 'high',
    type: 'eating_disorder',
    description: 'Content mentions eating disorder behaviors',
  },
  {
    pattern: /\b(addiction|relapse|withdrawal|using\s*again)\b/i,
    severity: 'medium',
    type: 'substance_concern',
    description: 'Content mentions addiction or substance use concerns',
  },
];

const DISTRESS_SENTIMENT_KEYWORDS = [
  'desperate',
  'trapped',
  'alone',
  'isolated',
  'empty',
  'numb',
  'exhausted',
  'defeated',
  'broken',
  'drowning',
  'suffocating',
  "can't take",
  'give up',
  'no hope',
  'no point',
  'burden',
];

export class RiskDetectionService {
  private contentClient: ContentServiceClient;

  constructor(private readonly safetyRepo: SafetyRepository) {
    this.contentClient = ContentServiceClient.getInstance();
  }

  async analyzeContent(input: AnalysisInput): Promise<DetectionResult> {
    const { content, userId, sourceType, sourceId, skipAI } = input;

    const keywordResult = this.analyzeWithKeywords(content);

    if (keywordResult.detected) {
      logger.warn('Risk detected via keyword matching', {
        userId,
        sourceType,
        severity: keywordResult.severity,
        type: keywordResult.type,
      });

      const flag = await this.createRiskFlag({
        userId,
        severity: keywordResult.severity!,
        type: keywordResult.type!,
        description: keywordResult.description!,
        sourceContent: this.truncateContent(content),
        sourceType,
        sourceId,
        matchedPatterns: keywordResult.matchedPatterns,
      });

      return {
        ...keywordResult,
        flagId: flag.id,
      };
    }

    if (!skipAI) {
      const aiResult = await this.analyzeWithAI(content, userId);

      if (aiResult.detected) {
        logger.warn('Risk detected via AI analysis', {
          userId,
          sourceType,
          severity: aiResult.severity,
          confidence: aiResult.aiConfidence,
        });

        const flag = await this.createRiskFlag({
          userId,
          severity: aiResult.severity!,
          type: aiResult.type!,
          description: aiResult.description!,
          sourceContent: this.truncateContent(content),
          sourceType,
          sourceId,
          matchedPatterns: [],
          aiConfidence: aiResult.aiConfidence,
        });

        return {
          ...aiResult,
          flagId: flag.id,
        };
      }
    }

    return {
      detected: false,
      severity: null,
      type: null,
      description: null,
      matchedPatterns: [],
    };
  }

  private analyzeWithKeywords(content: string): DetectionResult {
    const matchedPatterns: string[] = [];
    let highestSeverity: RiskSeverity | null = null;
    let matchedIndicator: RiskIndicator | null = null;

    const severityOrder: RiskSeverity[] = ['low', 'medium', 'high', 'crisis'];

    for (const indicator of CRISIS_KEYWORDS) {
      if (indicator.pattern.test(content)) {
        matchedPatterns.push(indicator.type);

        const currentIndex = highestSeverity ? severityOrder.indexOf(highestSeverity) : -1;
        const newIndex = severityOrder.indexOf(indicator.severity);

        if (newIndex > currentIndex) {
          highestSeverity = indicator.severity;
          matchedIndicator = indicator;
        }
      }
    }

    if (matchedIndicator) {
      return {
        detected: true,
        severity: highestSeverity,
        type: matchedIndicator.type,
        description: matchedIndicator.description,
        matchedPatterns,
      };
    }

    return {
      detected: false,
      severity: null,
      type: null,
      description: null,
      matchedPatterns: [],
    };
  }

  private async analyzeWithAI(content: string, userId: string): Promise<DetectionResult> {
    try {
      const distressWordCount = this.countDistressWords(content);
      const distressRatio = distressWordCount / content.split(/\s+/).length;

      if (distressRatio < 0.02 && distressWordCount < 2) {
        return {
          detected: false,
          severity: null,
          type: null,
          description: null,
          matchedPatterns: [],
        };
      }

      const analysisResult = await this.contentClient.analyzeEntry({
        content,
        userId,
      });

      if (analysisResult.error) {
        logger.warn('AI analysis failed, falling back to heuristics', { error: analysisResult.error });
        return this.heuristicAnalysis(content, distressWordCount);
      }

      const sentiment = analysisResult.analysis?.sentiment?.toLowerCase() || 'neutral';
      const emotions = analysisResult.analysis?.emotions || [];

      const negativeEmotions = emotions.filter((e: string) =>
        ['despair', 'hopelessness', 'severe_distress', 'crisis', 'suicidal'].includes(e.toLowerCase())
      );

      if (negativeEmotions.length > 0 || sentiment === 'very_negative' || sentiment === 'crisis') {
        const severity = this.mapSentimentToSeverity(sentiment, negativeEmotions);

        return {
          detected: true,
          severity,
          type: 'ai_detected_distress',
          description: `AI detected emotional distress: ${negativeEmotions.join(', ') || sentiment}`,
          matchedPatterns: negativeEmotions,
          aiConfidence: 0.75,
        };
      }

      return {
        detected: false,
        severity: null,
        type: null,
        description: null,
        matchedPatterns: [],
      };
    } catch (error) {
      logger.error('AI risk analysis failed, falling back to heuristics', {
        error: serializeError(error),
      });

      const distressWordCount = this.countDistressWords(content);
      return this.heuristicAnalysis(content, distressWordCount);
    }
  }

  private countDistressWords(content: string): number {
    const lowerContent = content.toLowerCase();
    return DISTRESS_SENTIMENT_KEYWORDS.filter(word => lowerContent.includes(word)).length;
  }

  private heuristicAnalysis(content: string, distressWordCount: number): DetectionResult {
    if (distressWordCount >= 4) {
      return {
        detected: true,
        severity: 'medium',
        type: 'heuristic_distress',
        description: 'Multiple distress indicators detected through heuristic analysis',
        matchedPatterns: [],
        aiConfidence: 0.5,
      };
    }

    return {
      detected: false,
      severity: null,
      type: null,
      description: null,
      matchedPatterns: [],
    };
  }

  private mapSentimentToSeverity(sentiment: string, emotions: string[]): RiskSeverity {
    if (emotions.some((e: string) => ['suicidal', 'crisis'].includes(e.toLowerCase()))) {
      return 'crisis';
    }
    if (emotions.some((e: string) => ['despair', 'hopelessness'].includes(e.toLowerCase()))) {
      return 'high';
    }
    if (sentiment === 'very_negative') {
      return 'high';
    }
    if (sentiment === 'negative' || emotions.length > 0) {
      return 'medium';
    }
    return 'low';
  }

  private async createRiskFlag(data: {
    userId: string;
    severity: RiskSeverity;
    type: string;
    description: string;
    sourceContent: string;
    sourceType: string;
    sourceId: string;
    matchedPatterns: string[];
    aiConfidence?: number;
  }) {
    return this.safetyRepo.createRiskFlag({
      userId: data.userId,
      severity: data.severity,
      type: data.type,
      description: data.description,
      sourceContent: data.sourceContent,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      metadata: {
        matchedPatterns: data.matchedPatterns,
        aiConfidence: data.aiConfidence,
        detectedAt: new Date().toISOString(),
      },
    });
  }

  private truncateContent(content: string, maxLength: number = 500): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }

  async getKeywordPatterns(): Promise<{ type: string; severity: RiskSeverity }[]> {
    return CRISIS_KEYWORDS.map(k => ({
      type: k.type,
      severity: k.severity,
    }));
  }
}
