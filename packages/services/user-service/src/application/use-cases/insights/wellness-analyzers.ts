import type {
  EntryData,
  InsightEntry,
  PatternEntry,
  SentimentDistribution,
  ClarityMetrics,
  InsightQualityMetrics,
  ConsistencyMetrics,
  GoalOrientedBehavior,
  SocialConnectionMetrics,
  CommunicationMetrics,
  RelationshipMetrics,
  EnergyIndicators,
  SleepIndicators,
  ExerciseIndicators,
  HealthAwarenessMetrics,
  PurposeIndicators,
  ValueConnectionMetrics,
} from './wellness-types';

function countKeywordMatches(entries: EntryData[], keywords: string[]): EntryData[] {
  return entries.filter(entry => {
    const content = entry.content.toLowerCase();
    return keywords.some(keyword => content.includes(keyword));
  });
}

function extractUniqueKeywords(entries: EntryData[], keywords: string[]): string[] {
  const found: string[] = [];
  entries.forEach(entry => {
    const content = entry.content.toLowerCase();
    keywords.forEach(keyword => {
      if (content.includes(keyword)) {
        found.push(keyword);
      }
    });
  });
  return [...new Set(found)];
}

export function extractEmotionalWords(entries: EntryData[]): Record<string, number> {
  const emotionalWords = [
    'happy', 'sad', 'angry', 'excited', 'anxious', 'calm', 'frustrated', 'grateful', 'peaceful',
  ];
  const wordCounts: Record<string, number> = {};

  entries.forEach(entry => {
    const content = entry.content.toLowerCase();
    emotionalWords.forEach(word => {
      if (content.includes(word)) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    });
  });

  return wordCounts;
}

export function analyzeSentimentDistribution(entries: EntryData[]): SentimentDistribution {
  let positive = 0,
    negative = 0,
    neutral = 0;

  entries.forEach(entry => {
    const content = entry.content.toLowerCase();
    const positiveWords = ['happy', 'great', 'good', 'excellent', 'wonderful', 'grateful', 'excited'];
    const negativeWords = ['sad', 'bad', 'terrible', 'awful', 'frustrated', 'angry', 'worried'];

    const hasPositive = positiveWords.some(word => content.includes(word));
    const hasNegative = negativeWords.some(word => content.includes(word));

    if (hasPositive && !hasNegative) positive++;
    else if (hasNegative && !hasPositive) negative++;
    else neutral++;
  });

  return { positive, negative, neutral };
}

export function calculateEmotionalVariability(_entries: EntryData[]): number {
  return 0.3;
}

export function findResilienceIndicators(entries: EntryData[], _insights: InsightEntry[]): string[] {
  return extractUniqueKeywords(entries, ['overcome', 'learn from', 'grow', 'bounce back', 'resilient', 'strong']);
}

export function calculateEmotionalTrend(_entries: EntryData[]): 'improving' | 'stable' | 'declining' {
  return 'improving';
}

export function generateEmotionalRecommendations(
  score: number,
  sentimentDist: SentimentDistribution,
  variability: number
): string[] {
  const recommendations = [];

  if (score < 50) {
    recommendations.push('Consider practicing mindfulness or meditation');
    recommendations.push('Engage in activities that bring you joy');
    recommendations.push('Consider speaking with a counselor or therapist');
  }

  if (variability > 0.7) {
    recommendations.push('Work on emotional regulation techniques');
    recommendations.push('Maintain consistent self-care routines');
  }

  if (sentimentDist.positive / (sentimentDist.positive + sentimentDist.negative + sentimentDist.neutral) < 0.4) {
    recommendations.push('Practice gratitude exercises');
    recommendations.push('Focus on positive experiences and achievements');
  }

  return recommendations;
}

export function analyzeClarityMetrics(entries: EntryData[]): ClarityMetrics {
  const clarityLevels = entries.map(t => {
    const wordCount = t.content.split(/\s+/).length;
    const hasStructuredSentiment = t.sentiment && t.sentiment !== 'neutral';
    if (wordCount > 100 && hasStructuredSentiment) {
      return 1;
    } else if (wordCount > 50) {
      return 0.6;
    } else if (wordCount > 20) {
      return 0.4;
    }
    return 0.2;
  });

  const averageClarity =
    clarityLevels.length > 0 ? clarityLevels.reduce((sum, level) => sum + level, 0) / clarityLevels.length : 0.5;

  const distribution = { clear: 0, forming: 0, unclear: 0 };
  clarityLevels.forEach(level => {
    if (level >= 0.8) distribution.clear++;
    else if (level >= 0.5) distribution.forming++;
    else distribution.unclear++;
  });

  return { averageClarity, distribution };
}

export function analyzeInsightQuality(insights: InsightEntry[]): InsightQualityMetrics {
  const averageConfidence =
    insights.length > 0 ? insights.reduce((sum, i) => sum + (Number(i.confidence) || 0), 0) / insights.length : 0.5;

  return { averageConfidence, highQualityCount: insights.filter(i => (Number(i.confidence) || 0) > 0.8).length };
}

export function findProblemSolvingIndicators(entries: EntryData[]): string[] {
  return extractUniqueKeywords(entries, ['solution', 'solve', 'approach', 'strategy', 'plan', 'analyze']);
}

export function calculateCognitiveTrend(
  _entries: EntryData[],
  _insights: InsightEntry[]
): 'improving' | 'stable' | 'declining' {
  return 'stable';
}

export function generateCognitiveRecommendations(
  score: number,
  clarity: ClarityMetrics,
  insightQuality: InsightQualityMetrics
): string[] {
  const recommendations = [];

  if (score < 60) {
    recommendations.push('Practice structured thinking exercises');
    recommendations.push('Engage in learning new skills or concepts');
  }

  if (clarity.averageClarity < 0.6) {
    recommendations.push('Spend more time organizing your entries before writing');
    recommendations.push('Try mind mapping or structured reflection techniques');
  }

  if (insightQuality.averageConfidence < 0.7) {
    recommendations.push('Reflect more deeply on your experiences');
    recommendations.push('Ask yourself "why" and "what if" questions');
  }

  return recommendations;
}

export function toDate(value: Date | string | unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return new Date();
}

export function analyzeConsistencyMetrics(entries: EntryData[]): ConsistencyMetrics {
  if (entries.length < 2) {
    return { consistencyScore: 0.5, streakDays: 0 };
  }

  const sortedEntries = [...entries].sort((a, b) => {
    const dateA = toDate(a.createdAt);
    const dateB = toDate(b.createdAt);
    return dateA.getTime() - dateB.getTime();
  });

  const consistencyScore = Math.min(1, sortedEntries.length / 30);

  return { consistencyScore, streakDays: 7 };
}

export function calculatePositiveBehaviorScore(patterns: PatternEntry[]): number {
  const positivePatterns = patterns.filter(
    p =>
      p.patternName.includes('exercise') ||
      p.patternName.includes('learning') ||
      p.patternName.includes('goal') ||
      p.trend === 'increasing'
  );

  return Math.min(20, positivePatterns.length * 5);
}

export function analyzeGoalOrientedBehavior(entries: EntryData[]): GoalOrientedBehavior {
  const goalMentions = countKeywordMatches(entries, ['goal', 'achieve', 'accomplish', 'target', 'objective']);
  const score = Math.min(1, (goalMentions.length / entries.length) * 3);
  return { score, mentions: goalMentions.length };
}

export function findAdaptabilityIndicators(entries: EntryData[], _patterns: PatternEntry[]): string[] {
  return extractUniqueKeywords(entries, ['adapt', 'flexible', 'adjust', 'change', 'pivot']);
}

export function calculateBehavioralTrend(
  _patterns: PatternEntry[],
  _analytics: import('./wellness-types').AnalyticsEntry[]
): 'improving' | 'stable' | 'declining' {
  return 'improving';
}

export function generateBehavioralRecommendations(
  score: number,
  consistency: ConsistencyMetrics,
  _patterns: PatternEntry[]
): string[] {
  const recommendations = [];

  if (score < 60) {
    recommendations.push('Establish more consistent daily routines');
    recommendations.push('Set specific, achievable goals');
  }

  if (consistency.consistencyScore < 0.5) {
    recommendations.push('Focus on building consistent habits');
    recommendations.push('Use habit tracking tools or apps');
  }

  return recommendations;
}

export function analyzeSocialConnections(entries: EntryData[]): SocialConnectionMetrics {
  const socialMentions = countKeywordMatches(entries, [
    'friend', 'family', 'colleague', 'partner', 'relationship', 'social', 'connect',
  ]);

  const score = Math.min(1, socialMentions.length / Math.max(entries.length * 0.3, 1));

  return {
    score,
    dataPoints: socialMentions.length,
    description: `Social connections mentioned in ${socialMentions.length} entries`,
  };
}

export function analyzeCommunicationQuality(entries: EntryData[]): CommunicationMetrics {
  const commMentions = countKeywordMatches(entries, ['communicate', 'listen', 'understand', 'express', 'share']);
  const score = Math.min(1, commMentions.length / Math.max(entries.length * 0.2, 1));

  return {
    score,
    description: `Communication quality indicators in ${commMentions.length} entries`,
  };
}

export function analyzeRelationshipSatisfaction(entries: EntryData[]): RelationshipMetrics {
  const satisfactionKeywords = ['happy with', 'grateful for', 'love', 'support', 'appreciate'];
  const dissatisfactionKeywords = ['conflict', 'argue', 'frustrated with', 'disappointed'];

  const positiveRelationships = countKeywordMatches(entries, satisfactionKeywords);
  const negativeRelationships = countKeywordMatches(entries, dissatisfactionKeywords);

  const score = positiveRelationships.length > negativeRelationships.length ? 0.7 : 0.4;

  return {
    score,
    description: `${positiveRelationships.length} positive vs ${negativeRelationships.length} challenging relationship mentions`,
  };
}

export function findEmpathyIndicators(entries: EntryData[]): string[] {
  return extractUniqueKeywords(entries, ['understand', 'empathy', 'feel for', 'perspective', 'compassion']);
}

export function calculateSocialTrend(_entries: EntryData[]): 'improving' | 'stable' | 'declining' {
  return 'stable';
}

export function generateSocialRecommendations(
  score: number,
  connections: SocialConnectionMetrics,
  _communication: CommunicationMetrics
): string[] {
  const recommendations = [];

  if (score < 50) {
    recommendations.push('Reach out to friends and family more regularly');
    recommendations.push('Join social groups or activities that interest you');
    recommendations.push('Practice active listening in conversations');
  }

  if (connections.score < 0.5) {
    recommendations.push('Make time for meaningful social connections');
    recommendations.push('Consider volunteering to meet like-minded people');
  }

  return recommendations;
}

export function findEnergyIndicators(entries: EntryData[]): EnergyIndicators {
  const energyMentions = countKeywordMatches(entries, ['tired', 'exhausted', 'energetic', 'fatigue', 'refreshed', 'drained']);
  const averageLevel = 0.6;

  return { averageLevel, count: energyMentions.length };
}

export function findSleepIndicators(entries: EntryData[]): SleepIndicators {
  const sleepMentions = countKeywordMatches(entries, ['sleep', 'tired', 'rest', 'insomnia', 'dream']);
  const averageQuality = 0.7;

  return { averageQuality, count: sleepMentions.length };
}

export function findExerciseIndicators(entries: EntryData[]): ExerciseIndicators {
  const exerciseMentions = countKeywordMatches(entries, ['exercise', 'workout', 'gym', 'run', 'walk', 'sport']);
  const frequency = Math.min(1, exerciseMentions.length / Math.max(entries.length * 0.1, 1));

  return { frequency, count: exerciseMentions.length };
}

export function analyzeHealthAwareness(entries: EntryData[]): HealthAwarenessMetrics {
  const healthMentions = countKeywordMatches(entries, ['health', 'nutrition', 'diet', 'wellness', 'medical']);
  const score = Math.min(1, healthMentions.length / Math.max(entries.length * 0.1, 1));

  return {
    score,
    description: `Health awareness mentioned in ${healthMentions.length} entries`,
  };
}

export function calculatePhysicalTrend(_entries: EntryData[]): 'improving' | 'stable' | 'declining' {
  return 'stable';
}

export function generatePhysicalRecommendations(score: number, energy: EnergyIndicators, _sleep: SleepIndicators): string[] {
  const recommendations = [];

  if (score < 60) {
    recommendations.push('Prioritize regular sleep schedule');
    recommendations.push('Incorporate physical activity into your routine');
    recommendations.push('Pay attention to nutrition and hydration');
  }

  if (energy.averageLevel < 0.5) {
    recommendations.push('Evaluate energy levels and potential causes');
    recommendations.push('Consider consulting a healthcare provider');
  }

  return recommendations;
}

export function findPurposeIndicators(entries: EntryData[]): PurposeIndicators {
  const purposeMentions = countKeywordMatches(entries, ['purpose', 'meaning', 'mission', 'calling', 'fulfill']);
  const score = Math.min(1, purposeMentions.length / Math.max(entries.length * 0.1, 1));

  return {
    score,
    dataPoints: purposeMentions.length,
    description: `Purpose-related entries: ${purposeMentions.length}`,
  };
}

export function analyzeMeaningfulness(entries: EntryData[]): number {
  const meaningfulEntries = countKeywordMatches(entries, ['meaningful', 'significant', 'important', 'valuable', 'profound']);
  return Math.min(1, meaningfulEntries.length / Math.max(entries.length * 0.2, 1));
}

export function findGratitudeIndicators(entries: EntryData[]): string[] {
  return extractUniqueKeywords(entries, ['grateful', 'thankful', 'appreciate', 'blessed', 'fortunate']);
}

export function analyzeValueConnection(entries: EntryData[]): ValueConnectionMetrics {
  const valueMentions = countKeywordMatches(entries, ['value', 'principle', 'belief', 'authentic', 'integrity']);
  const score = Math.min(1, valueMentions.length / Math.max(entries.length * 0.1, 1));

  return {
    score,
    description: `Values alignment mentioned in ${valueMentions.length} entries`,
  };
}

export function calculateSpiritualTrend(_entries: EntryData[]): 'improving' | 'stable' | 'declining' {
  return 'stable';
}

export function generateSpiritualRecommendations(score: number, purpose: PurposeIndicators, gratitude: string[]): string[] {
  const recommendations = [];

  if (score < 50) {
    recommendations.push('Explore practices that connect you to your values');
    recommendations.push('Consider meditation or contemplative practices');
    recommendations.push('Reflect on what gives your life meaning');
  }

  if (purpose.score < 0.3) {
    recommendations.push('Spend time identifying your core values and purpose');
    recommendations.push('Engage in activities aligned with your beliefs');
  }

  if (gratitude.length < 3) {
    recommendations.push('Practice daily gratitude exercises');
    recommendations.push('Keep a gratitude book');
  }

  return recommendations;
}

export function calculateDimensionConfidence(primaryDataPoints: number, secondaryDataPoints: number): number {
  let confidence = 0.5;

  if (primaryDataPoints > 20) confidence += 0.3;
  else if (primaryDataPoints > 10) confidence += 0.2;
  else if (primaryDataPoints > 5) confidence += 0.1;

  if (secondaryDataPoints > 5) confidence += 0.1;

  return Math.min(1, confidence);
}
