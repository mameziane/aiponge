import type { WellnessData, WellnessMetrics, WellnessTrend, WellnessInsight } from './wellness-types';

export function calculateOverallWellnessScore(metrics: WellnessMetrics): number {
  const dimensions = Object.values(metrics);
  const weights = {
    emotional: 0.25,
    cognitive: 0.2,
    behavioral: 0.2,
    social: 0.15,
    physical: 0.1,
    spiritual: 0.1,
  };

  let weightedSum = 0;
  let totalWeight = 0;

  dimensions.forEach(dimension => {
    const weight = weights[dimension.name.toLowerCase().split(' ')[0] as keyof typeof weights] || 0.1;
    weightedSum += dimension.score * weight;
    totalWeight += weight;
  });

  return Math.round(weightedSum / totalWeight);
}

export function determineWellnessGrade(score: number): 'excellent' | 'good' | 'fair' | 'needs_attention' | 'critical' {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'fair';
  if (score >= 40) return 'needs_attention';
  return 'critical';
}

export function generateWellnessTrends(
  timeframe: { start: Date; end: Date },
  currentMetrics: WellnessMetrics,
  currentScore: number
): WellnessTrend[] {
  return [
    {
      date: timeframe.end,
      overallScore: currentScore,
      dimensionScores: {
        emotional: currentMetrics.emotional?.score || 0,
        cognitive: currentMetrics.cognitive?.score || 0,
        behavioral: currentMetrics.behavioral?.score || 0,
        social: currentMetrics.social?.score || 0,
        physical: currentMetrics.physical?.score || 0,
        spiritual: currentMetrics.spiritual?.score || 0,
      },
      significantEvents: [],
      notes: 'Current wellness assessment',
    },
  ];
}

export function generateWellnessInsights(
  metrics: WellnessMetrics,
  _wellnessData: WellnessData,
  _trends: WellnessTrend[]
): WellnessInsight[] {
  const insights: WellnessInsight[] = [];

  const dimensionScores = Object.values(metrics).map(m => ({ name: m.name, score: m.score }));
  const highestDimension = dimensionScores.reduce((prev, current) => (prev.score > current.score ? prev : current));
  const lowestDimension = dimensionScores.reduce((prev, current) => (prev.score < current.score ? prev : current));

  if (highestDimension.score > 80) {
    insights.push({
      id: `insight_strength_${Date.now()}`,
      type: 'celebration',
      title: `Strong ${highestDimension.name}`,
      description: `Your ${highestDimension.name.toLowerCase()} is performing exceptionally well with a score of ${highestDimension.score}.`,
      confidence: 0.9,
      urgency: 'low',
      category: highestDimension.name.toLowerCase(),
      actionable: false,
      suggestedActions: [`Continue practices that support your ${highestDimension.name.toLowerCase()}`],
      timeframe: 'ongoing',
      relatedDimensions: [highestDimension.name.toLowerCase()],
    });
  }

  if (lowestDimension.score < 60) {
    insights.push({
      id: `insight_improvement_${Date.now()}`,
      type: 'recommendation',
      title: `${lowestDimension.name} Needs Attention`,
      description: `Your ${lowestDimension.name.toLowerCase()} score of ${lowestDimension.score} suggests room for improvement.`,
      confidence: 0.8,
      urgency: lowestDimension.score < 40 ? 'high' : 'medium',
      category: lowestDimension.name.toLowerCase(),
      actionable: true,
      suggestedActions:
        metrics[lowestDimension.name.toLowerCase().split(' ')[0] as keyof WellnessMetrics]?.recommendations || [],
      timeframe: 'short-term',
      relatedDimensions: [lowestDimension.name.toLowerCase()],
    });
  }

  const scoreRange = highestDimension.score - lowestDimension.score;
  if (scoreRange > 30) {
    insights.push({
      id: `insight_balance_${Date.now()}`,
      type: 'pattern',
      title: 'Wellness Dimension Imbalance',
      description: `There's a significant gap between your highest (${highestDimension.name}: ${highestDimension.score}) and lowest (${lowestDimension.name}: ${lowestDimension.score}) wellness dimensions.`,
      confidence: 0.75,
      urgency: 'medium',
      category: 'overall',
      actionable: true,
      suggestedActions: [
        `Focus on improving ${lowestDimension.name.toLowerCase()}`,
        'Consider how your strong areas can support weaker ones',
        'Aim for more balanced wellness development',
      ],
      timeframe: 'medium-term',
      relatedDimensions: [highestDimension.name.toLowerCase(), lowestDimension.name.toLowerCase()],
    });
  }

  return insights;
}

export function createWellnessSummary(metrics: WellnessMetrics, insights: WellnessInsight[], overallScore: number) {
  const dimensionScores = Object.values(metrics).map(m => ({ name: m.name, score: m.score }));
  const strengths = dimensionScores.filter(d => d.score > 75).map(d => d.name);
  const concerns = dimensionScores.filter(d => d.score < 50).map(d => d.name);

  const keyFindings = [
    `Overall wellness score: ${overallScore}`,
    `Strongest area: ${dimensionScores.reduce((prev, current) => (prev.score > current.score ? prev : current)).name}`,
    `Area for improvement: ${dimensionScores.reduce((prev, current) => (prev.score < current.score ? prev : current)).name}`,
  ];

  const priorityRecommendations = insights
    .filter(i => i.actionable && i.urgency !== 'low')
    .map(i => i.suggestedActions[0])
    .filter(Boolean)
    .slice(0, 3);

  return {
    strengths,
    concerns,
    keyFindings,
    priorityRecommendations,
  };
}

export function generateWellnessComparison(currentScore: number, currentMetrics: WellnessMetrics) {
  const previousScore = 72;
  const change = currentScore - previousScore;

  const changeDescription =
    change > 5
      ? 'significant improvement'
      : change > 0
        ? 'slight improvement'
        : change > -5
          ? 'relatively stable'
          : 'decline that needs attention';

  return {
    previousScore,
    change,
    changeDescription,
    significantChanges: [
      {
        dimension: 'Emotional',
        previousScore: 68,
        currentScore: currentMetrics.emotional?.score || 0,
        change: (currentMetrics.emotional?.score || 0) - 68,
        explanation: 'Improved emotional regulation and positive sentiment',
      },
    ],
  };
}

export function generateWellnessAlerts(metrics: WellnessMetrics, _insights: WellnessInsight[], overallScore: number) {
  const alerts: Array<{
    level: 'info' | 'warning' | 'critical';
    dimension: string;
    message: string;
    actionRequired: boolean;
    suggestedActions: string[];
  }> = [];

  if (overallScore < 40) {
    alerts.push({
      level: 'critical',
      dimension: 'overall',
      message: 'Overall wellness score is critically low and requires immediate attention',
      actionRequired: true,
      suggestedActions: [
        'Consider speaking with a healthcare professional',
        'Focus on basic self-care practices',
        'Reach out to your support network',
      ],
    });
  }

  Object.values(metrics).forEach(dimension => {
    if (dimension.score < 30) {
      alerts.push({
        level: 'critical',
        dimension: dimension.name.toLowerCase(),
        message: `${dimension.name} is critically low`,
        actionRequired: true,
        suggestedActions: dimension.recommendations.slice(0, 2),
      });
    } else if (dimension.score < 50) {
      alerts.push({
        level: 'warning',
        dimension: dimension.name.toLowerCase(),
        message: `${dimension.name} needs attention`,
        actionRequired: false,
        suggestedActions: dimension.recommendations.slice(0, 1),
      });
    }
  });

  if (overallScore > 85) {
    alerts.push({
      level: 'info',
      dimension: 'overall',
      message: 'Excellent overall wellness! Keep up the great work.',
      actionRequired: false,
      suggestedActions: ['Maintain current wellness practices', 'Consider sharing your strategies with others'],
    });
  }

  return alerts;
}

export function calculateConfidenceMetrics(wellnessData: WellnessData, timeframe: { start: Date; end: Date }) {
  const { dataPoints } = wellnessData;
  const timeSpanDays = Math.ceil((timeframe.end.getTime() - timeframe.start.getTime()) / (1000 * 60 * 60 * 24));

  let overall = 0.7;

  if (dataPoints > 50) overall += 0.2;
  else if (dataPoints > 20) overall += 0.1;
  else if (dataPoints < 5) overall -= 0.3;

  const timeSpanAdequacy = timeSpanDays >= 14;
  if (!timeSpanAdequacy) overall -= 0.2;

  const dataQuality = dataPoints > 50 ? 'excellent' : dataPoints > 20 ? 'good' : dataPoints > 10 ? 'fair' : 'limited';

  const limitations = [];
  if (dataPoints < 20) limitations.push('Limited data points for comprehensive analysis');
  if (timeSpanDays < 14) limitations.push('Short time period may not reflect typical patterns');
  if (!wellnessData.entries || wellnessData.entries.length < 10) {
    limitations.push('Physical and social wellness estimates have lower confidence due to limited direct data');
  }

  return {
    overall: Math.max(0, Math.min(1, overall)),
    dataQuality: dataQuality as 'excellent' | 'good' | 'fair' | 'limited',
    dataPoints,
    timeSpanAdequacy,
    limitations,
  };
}
