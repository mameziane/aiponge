import type { WellnessData, WellnessDimension } from './wellness-types';
import {
  extractEmotionalWords,
  analyzeSentimentDistribution,
  calculateEmotionalVariability,
  findResilienceIndicators,
  calculateEmotionalTrend,
  generateEmotionalRecommendations,
  analyzeClarityMetrics,
  analyzeInsightQuality,
  findProblemSolvingIndicators,
  calculateCognitiveTrend,
  generateCognitiveRecommendations,
  analyzeConsistencyMetrics,
  calculatePositiveBehaviorScore,
  analyzeGoalOrientedBehavior,
  findAdaptabilityIndicators,
  calculateBehavioralTrend,
  generateBehavioralRecommendations,
  analyzeSocialConnections,
  analyzeCommunicationQuality,
  analyzeRelationshipSatisfaction,
  findEmpathyIndicators,
  calculateSocialTrend,
  generateSocialRecommendations,
  findEnergyIndicators,
  findSleepIndicators,
  findExerciseIndicators,
  analyzeHealthAwareness,
  calculatePhysicalTrend,
  generatePhysicalRecommendations,
  findPurposeIndicators,
  analyzeMeaningfulness,
  findGratitudeIndicators,
  analyzeValueConnection,
  calculateSpiritualTrend,
  generateSpiritualRecommendations,
  calculateDimensionConfidence,
} from './wellness-analyzers';

export function calculateEmotionalWellness(wellnessData: WellnessData, _depth: string): WellnessDimension {
  const { entries, insights } = wellnessData;

  const emotionalWords = extractEmotionalWords(entries);
  const sentimentDistribution = analyzeSentimentDistribution(entries);
  const emotionalVariability = calculateEmotionalVariability(entries);
  const resilienceIndicators = findResilienceIndicators(entries, insights);

  let score = 60;

  const positiveRatio =
    sentimentDistribution.positive /
    (sentimentDistribution.positive + sentimentDistribution.negative + sentimentDistribution.neutral);
  score += (positiveRatio - 0.5) * 40;

  score += (1 - emotionalVariability) * 20;

  score += resilienceIndicators.length * 5;

  score = Math.max(0, Math.min(100, score));

  const trend = calculateEmotionalTrend(entries);

  const contributors = [
    {
      factor: 'Positive sentiment',
      impact: Math.round((positiveRatio - 0.5) * 40),
      weight: 0.4,
      description: `${Math.round(positiveRatio * 100)}% positive emotional expressions`,
    },
    {
      factor: 'Emotional stability',
      impact: Math.round((1 - emotionalVariability) * 20),
      weight: 0.3,
      description: `Emotional variability score: ${Math.round((1 - emotionalVariability) * 100)}%`,
    },
    {
      factor: 'Resilience indicators',
      impact: resilienceIndicators.length * 5,
      weight: 0.3,
      description: `Found ${resilienceIndicators.length} resilience patterns`,
    },
  ];

  const recommendations = generateEmotionalRecommendations(score, sentimentDistribution, emotionalVariability);

  return {
    name: 'Emotional Wellness',
    score: Math.round(score),
    trend,
    confidence: calculateDimensionConfidence(entries.length, insights.length),
    lastCalculated: new Date(),
    contributors,
    recommendations,
  };
}

export function calculateCognitiveWellness(wellnessData: WellnessData, _depth: string): WellnessDimension {
  const { entries, insights, patterns } = wellnessData;

  const clarityMetrics = analyzeClarityMetrics(entries);
  const insightQuality = analyzeInsightQuality(insights);
  const cognitivePatterns = patterns.filter(p => p.patternType === 'cognitive');
  const problemSolvingIndicators = findProblemSolvingIndicators(entries);

  let score = 65;

  score += clarityMetrics.averageClarity * 25;

  score += insightQuality.averageConfidence * 20;

  const cognitivePatternStrength =
    cognitivePatterns.reduce((sum, p) => sum + (Number(p.strength) || 0), 0) / Math.max(cognitivePatterns.length, 1);
  score += cognitivePatternStrength * 15;

  score += problemSolvingIndicators.length * 3;

  score = Math.max(0, Math.min(100, score));

  const trend = calculateCognitiveTrend(entries, insights);

  const contributors = [
    {
      factor: 'Entry clarity',
      impact: Math.round(clarityMetrics.averageClarity * 25),
      weight: 0.35,
      description: `Average clarity level: ${Math.round(clarityMetrics.averageClarity * 100)}%`,
    },
    {
      factor: 'Insight quality',
      impact: Math.round(insightQuality.averageConfidence * 20),
      weight: 0.3,
      description: `Insight confidence: ${Math.round(insightQuality.averageConfidence * 100)}%`,
    },
    {
      factor: 'Cognitive patterns',
      impact: Math.round(cognitivePatternStrength * 15),
      weight: 0.25,
      description: `${cognitivePatterns.length} cognitive patterns identified`,
    },
    {
      factor: 'Problem-solving',
      impact: problemSolvingIndicators.length * 3,
      weight: 0.1,
      description: `${problemSolvingIndicators.length} problem-solving instances`,
    },
  ];

  const recommendations = generateCognitiveRecommendations(score, clarityMetrics, insightQuality);

  return {
    name: 'Cognitive Wellness',
    score: Math.round(score),
    trend,
    confidence: calculateDimensionConfidence(entries.length + insights.length, cognitivePatterns.length),
    lastCalculated: new Date(),
    contributors,
    recommendations,
  };
}

export function calculateBehavioralWellness(wellnessData: WellnessData, _depth: string): WellnessDimension {
  const { entries, patterns, analytics } = wellnessData;

  const consistencyMetrics = analyzeConsistencyMetrics(entries);
  const behavioralPatterns = patterns.filter(p => p.patternType === 'behavioral');
  const goalOrientedBehavior = analyzeGoalOrientedBehavior(entries);
  const adaptabilityIndicators = findAdaptabilityIndicators(entries, patterns);

  let score = 60;

  score += consistencyMetrics.consistencyScore * 30;

  const positiveBehaviorScore = calculatePositiveBehaviorScore(behavioralPatterns);
  score += positiveBehaviorScore;

  score += goalOrientedBehavior.score * 15;

  score += adaptabilityIndicators.length * 2;

  score = Math.max(0, Math.min(100, score));

  const trend = calculateBehavioralTrend(patterns, analytics);

  const contributors = [
    {
      factor: 'Consistency',
      impact: Math.round(consistencyMetrics.consistencyScore * 30),
      weight: 0.4,
      description: `Consistency score: ${Math.round(consistencyMetrics.consistencyScore * 100)}%`,
    },
    {
      factor: 'Positive behaviors',
      impact: Math.round(positiveBehaviorScore),
      weight: 0.3,
      description: `${behavioralPatterns.length} behavioral patterns analyzed`,
    },
    {
      factor: 'Goal orientation',
      impact: Math.round(goalOrientedBehavior.score * 15),
      weight: 0.2,
      description: `Goal-oriented behavior score: ${Math.round(goalOrientedBehavior.score * 100)}%`,
    },
    {
      factor: 'Adaptability',
      impact: adaptabilityIndicators.length * 2,
      weight: 0.1,
      description: `${adaptabilityIndicators.length} adaptability indicators`,
    },
  ];

  const recommendations = generateBehavioralRecommendations(score, consistencyMetrics, behavioralPatterns);

  return {
    name: 'Behavioral Wellness',
    score: Math.round(score),
    trend,
    confidence: calculateDimensionConfidence(patterns.length, entries.length),
    lastCalculated: new Date(),
    contributors,
    recommendations,
  };
}

export function calculateSocialWellness(wellnessData: WellnessData, _depth: string): WellnessDimension {
  const { entries } = wellnessData;

  const socialConnections = analyzeSocialConnections(entries);
  const communicationQuality = analyzeCommunicationQuality(entries);
  const relationshipSatisfaction = analyzeRelationshipSatisfaction(entries);
  const empathyIndicators = findEmpathyIndicators(entries);

  let score = 55;

  score += socialConnections.score * 25;

  score += communicationQuality.score * 20;

  score += relationshipSatisfaction.score * 20;

  score += empathyIndicators.length * 3;

  score = Math.max(0, Math.min(100, score));

  const trend = calculateSocialTrend(entries);

  const contributors = [
    {
      factor: 'Social connections',
      impact: Math.round(socialConnections.score * 25),
      weight: 0.35,
      description: socialConnections.description,
    },
    {
      factor: 'Communication quality',
      impact: Math.round(communicationQuality.score * 20),
      weight: 0.3,
      description: communicationQuality.description,
    },
    {
      factor: 'Relationship satisfaction',
      impact: Math.round(relationshipSatisfaction.score * 20),
      weight: 0.25,
      description: relationshipSatisfaction.description,
    },
    {
      factor: 'Empathy indicators',
      impact: empathyIndicators.length * 3,
      weight: 0.1,
      description: `${empathyIndicators.length} empathy expressions found`,
    },
  ];

  const recommendations = generateSocialRecommendations(score, socialConnections, communicationQuality);

  return {
    name: 'Social Wellness',
    score: Math.round(score),
    trend,
    confidence: calculateDimensionConfidence(socialConnections.dataPoints, 0),
    lastCalculated: new Date(),
    contributors,
    recommendations,
  };
}

export function calculatePhysicalWellness(wellnessData: WellnessData, _depth: string): WellnessDimension {
  const { entries } = wellnessData;

  const energyIndicators = findEnergyIndicators(entries);
  const sleepIndicators = findSleepIndicators(entries);
  const exerciseIndicators = findExerciseIndicators(entries);
  const healthAwareness = analyzeHealthAwareness(entries);

  let score = 60;

  score += energyIndicators.averageLevel * 20;

  score += sleepIndicators.averageQuality * 15;

  score += exerciseIndicators.frequency * 10;

  score += healthAwareness.score * 5;

  score = Math.max(0, Math.min(100, score));

  const trend = calculatePhysicalTrend(entries);

  const contributors = [
    {
      factor: 'Energy levels',
      impact: Math.round(energyIndicators.averageLevel * 20),
      weight: 0.4,
      description: `Energy level indicators: ${energyIndicators.count}`,
    },
    {
      factor: 'Sleep quality',
      impact: Math.round(sleepIndicators.averageQuality * 15),
      weight: 0.3,
      description: `Sleep quality indicators: ${sleepIndicators.count}`,
    },
    {
      factor: 'Physical activity',
      impact: Math.round(exerciseIndicators.frequency * 10),
      weight: 0.2,
      description: `Activity mentions: ${exerciseIndicators.count}`,
    },
    {
      factor: 'Health awareness',
      impact: Math.round(healthAwareness.score * 5),
      weight: 0.1,
      description: healthAwareness.description,
    },
  ];

  const recommendations = generatePhysicalRecommendations(score, energyIndicators, sleepIndicators);

  return {
    name: 'Physical Wellness',
    score: Math.round(score),
    trend,
    confidence: 0.6,
    lastCalculated: new Date(),
    contributors,
    recommendations,
  };
}

export function calculateSpiritualWellness(wellnessData: WellnessData, _depth: string): WellnessDimension {
  const { entries } = wellnessData;

  const purposeIndicators = findPurposeIndicators(entries);
  const meaningfulnessScore = analyzeMeaningfulness(entries);
  const gratitudeIndicators = findGratitudeIndicators(entries);
  const connectionToValues = analyzeValueConnection(entries);

  let score = 58;

  score += purposeIndicators.score * 25;

  score += meaningfulnessScore * 20;

  score += gratitudeIndicators.length * 4;

  score += connectionToValues.score * 15;

  score = Math.max(0, Math.min(100, score));

  const trend = calculateSpiritualTrend(entries);

  const contributors = [
    {
      factor: 'Sense of purpose',
      impact: Math.round(purposeIndicators.score * 25),
      weight: 0.4,
      description: purposeIndicators.description,
    },
    {
      factor: 'Meaningfulness',
      impact: Math.round(meaningfulnessScore * 20),
      weight: 0.3,
      description: `Meaningfulness indicators found in ${Math.round(meaningfulnessScore * 100)}% of reflections`,
    },
    {
      factor: 'Gratitude practice',
      impact: gratitudeIndicators.length * 4,
      weight: 0.2,
      description: `${gratitudeIndicators.length} gratitude expressions`,
    },
    {
      factor: 'Values alignment',
      impact: Math.round(connectionToValues.score * 15),
      weight: 0.1,
      description: connectionToValues.description,
    },
  ];

  const recommendations = generateSpiritualRecommendations(score, purposeIndicators, gratitudeIndicators);

  return {
    name: 'Spiritual Wellness',
    score: Math.round(score),
    trend,
    confidence: calculateDimensionConfidence(purposeIndicators.dataPoints, gratitudeIndicators.length),
    lastCalculated: new Date(),
    contributors,
    recommendations,
  };
}
