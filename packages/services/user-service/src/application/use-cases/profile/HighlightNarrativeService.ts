import { EntryRecord } from '@domains/profile';
import {
  UserHighlightData,
  filterEntriesByIds,
} from './highlight-types';
import type { ProfileHighlight, HighlightCollection } from './GenerateProfileHighlightsUseCase';

export class HighlightNarrativeService {
  async generateHighlightNarratives(
    highlights: ProfileHighlight[],
    userData: UserHighlightData,
    format: string
  ): Promise<ProfileHighlight[]> {
    return highlights.map(highlight => ({
      ...highlight,
      narrative: this.generateNarrativeForHighlight(highlight, userData, format),
    }));
  }

  generateNarrativeForHighlight(highlight: ProfileHighlight, userData: UserHighlightData, format: string) {
    const summary = this.generateHighlightSummary(highlight, format);
    const context = this.generateHighlightContext(highlight, userData);
    const impact = this.generateHighlightImpact(highlight, userData);
    const futureImplications = this.generateFutureImplications(highlight);

    return {
      summary,
      context,
      impact,
      futureImplications,
    };
  }

  generateHighlightSummary(highlight: ProfileHighlight, format: string): string {
    if (format === 'narrative_focused') {
      return `On ${highlight.date.toLocaleDateString()}, you experienced a significant moment in your journey: ${highlight.title}. ${highlight.description}`;
    }
    return `${highlight.title} - ${highlight.description}`;
  }

  generateHighlightContext(highlight: ProfileHighlight, userData: UserHighlightData): string {
    const relatedEntries = filterEntriesByIds(userData.entries, highlight.relatedContent.entryIds);

    if (relatedEntries.length > 0) {
      return `This highlight emerged from your reflections on ${highlight.date.toLocaleDateString()}, where you explored themes around ${highlight.category}.`;
    }

    return `This ${highlight.type.replace('_', ' ')} represents an important moment in your ${highlight.category} development.`;
  }

  generateHighlightImpact(highlight: ProfileHighlight, _userData: UserHighlightData): string {
    const impactLevel =
      highlight.metrics.impactScore > 80
        ? 'significant'
        : highlight.metrics.impactScore > 60
          ? 'meaningful'
          : 'positive';

    return `This moment had a ${impactLevel} impact on your growth journey, contributing to your overall development in ${highlight.category} awareness.`;
  }

  generateFutureImplications(highlight: ProfileHighlight): string {
    const implications = {
      breakthrough_insight: 'This insight opens new pathways for personal growth and self-understanding.',
      milestone_achievement:
        'This achievement demonstrates your commitment and sets the foundation for continued progress.',
      pattern_discovery: 'Understanding this pattern empowers you to make more conscious choices going forward.',
      growth_moment: 'This growth moment indicates your evolving capacity for self-development.',
      turning_point: 'This turning point marks a new chapter in your personal development journey.',
      reflection_quality: 'This level of reflection depth enhances your capacity for self-awareness.',
      consistency_streak: 'This consistency builds the foundation for lasting positive change.',
    };

    return (
      implications[highlight.type] || 'This moment contributes to your ongoing journey of growth and self-discovery.'
    );
  }

  async addVisualizationsToHighlights(
    highlights: ProfileHighlight[],
    userData: UserHighlightData
  ): Promise<void> {
    for (const highlight of highlights) {
      highlight.visualizations = this.generateVisualizationsForHighlight(highlight, userData);
    }
  }

  generateVisualizationsForHighlight(highlight: ProfileHighlight, userData: UserHighlightData) {
    const visualizations = [];

    if (highlight.type === 'consistency_streak' || highlight.type === 'pattern_discovery') {
      visualizations.push({
        chartType: 'timeline',
        data: {
          events: highlight.relatedContent.entryIds
            .slice(0, 10)
            .map(id => {
              const entry = userData.entries.find((t: EntryRecord) => t.id === id);
              return entry ? { date: entry.createdAt, title: entry.content.substring(0, 50) } : null;
            })
            .filter(Boolean),
        },
        configuration: {
          title: `${highlight.title} Timeline`,
          xAxis: 'Date',
          yAxis: 'Activity',
        },
      });
    }

    if (highlight.type === 'milestone_achievement') {
      visualizations.push({
        chartType: 'progress',
        data: {
          current: highlight.metrics.impactScore,
          target: 100,
          milestones: [25, 50, 75, 100],
        },
        configuration: {
          title: 'Progress Toward Goal',
          unit: '%',
        },
      });
    }

    return visualizations;
  }

  createHighlightCollection(
    userId: string,
    highlights: ProfileHighlight[],
    timeframe: { start: Date; end: Date },
    collectionType: string
  ): HighlightCollection {
    const significanceDistribution = highlights.reduce(
      (acc, h) => {
        acc[h.significance] = (acc[h.significance] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const categoryDistribution = highlights.reduce(
      (acc, h) => {
        acc[h.category] = (acc[h.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const averageImpactScore =
      highlights.length > 0 ? highlights.reduce((sum, h) => sum + h.metrics.impactScore, 0) / highlights.length : 0;

    const timelineLength = Math.ceil((timeframe.end.getTime() - timeframe.start.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: this.generateCollectionId(userId),
      userId,
      title: this.generateCollectionTitle(collectionType, timeframe),
      description: this.generateCollectionDescription(collectionType, highlights.length, timeframe),
      highlights,
      timeframe,
      collectionType: collectionType as HighlightCollection['collectionType'],
      metadata: {
        totalHighlights: highlights.length,
        significanceDistribution,
        categoryDistribution,
        averageImpactScore: Math.round(averageImpactScore),
        timelineLength,
      },
      narrativeSummary: this.generateCollectionNarrative(highlights, timeframe),
      createdAt: new Date(),
    };
  }

  generateHighlightAnalytics(
    candidates: Partial<ProfileHighlight>[],
    selected: ProfileHighlight[],
    _userData: UserHighlightData,
    timeframe: { start: Date; end: Date }
  ) {
    const significanceBreakdown = selected.reduce(
      (acc, h) => {
        acc[h.significance] = (acc[h.significance] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const sortedByDate = selected.sort((a, b) => a.date.getTime() - b.date.getTime());
    const timeBetweenHighlights =
      sortedByDate.length > 1
        ? sortedByDate.slice(1).map((h, i) => h.date.getTime() - sortedByDate[i].date.getTime())
        : [];

    const averageTimeBetween =
      timeBetweenHighlights.length > 0
        ? timeBetweenHighlights.reduce((sum, time) => sum + time, 0) /
          timeBetweenHighlights.length /
          (1000 * 60 * 60 * 24)
        : 0;

    const monthCounts = selected.reduce(
      (acc, h) => {
        const monthKey = `${h.date.getFullYear()}-${h.date.getMonth() + 1}`;
        acc[monthKey] = (acc[monthKey] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const mostActiveMonth = Object.entries(monthCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'N/A';

    const timeframeDays = Math.ceil((timeframe.end.getTime() - timeframe.start.getTime()) / (1000 * 60 * 60 * 24));
    const highlightDensity = selected.length / (timeframeDays / 30);

    return {
      totalCandidates: candidates.length,
      selectedHighlights: selected.length,
      significanceBreakdown,
      timelineAnalysis: {
        averageTimeBetweenHighlights: Math.round(averageTimeBetween),
        mostActiveMonth,
        highlightDensity: Math.round(highlightDensity * 100) / 100,
      },
      growthTrajectory: {
        overallTrend: 'improving' as const,
        accelerationPoints: sortedByDate.filter(h => h.significance === 'high').map(h => h.date),
        plateauPeriods: [],
      },
    };
  }

  generateRecommendations(
    highlights: ProfileHighlight[],
    _userData: UserHighlightData,
    _analytics: Record<string, unknown>
  ) {
    const nextOpportunities = [
      'Continue building on your consistency achievements',
      'Explore deeper insights in areas showing breakthrough potential',
      'Document your growth journey for future reflection',
    ];

    const improvementAreas = [
      'Consider exploring new reflection frameworks',
      'Focus on areas with fewer highlights for balanced growth',
      'Increase depth in your reflection practice',
    ];

    const celebrationMoments = highlights
      .filter(h => h.significance === 'high')
      .map(h => `Celebrate your ${h.title.toLowerCase()}`)
      .slice(0, 3);

    return {
      nextHighlightOpportunities: nextOpportunities,
      improvementAreas,
      celebrationMoments,
    };
  }

  private generateCollectionId(userId: string): string {
    const { randomUUID } = require('crypto');
    return `collection_${userId}_${Date.now()}_${randomUUID()}`;
  }

  private generateCollectionTitle(type: string, timeframe: { start: Date; end: Date }): string {
    const year = timeframe.end.getFullYear();
    const titleMap = {
      journey_overview: `Your Journey Overview (${year})`,
      year_in_review: `Year in Review ${year}`,
      growth_story: `Your Growth Story`,
      breakthrough_moments: `Breakthrough Moments`,
      custom: `Personal Highlights`,
    };
    return titleMap[type as keyof typeof titleMap] || 'Personal Highlights';
  }

  private generateCollectionDescription(type: string, count: number, timeframe: { start: Date; end: Date }): string {
    const timeSpan = Math.ceil((timeframe.end.getTime() - timeframe.start.getTime()) / (1000 * 60 * 60 * 24));
    return `A collection of ${count} significant moments from your ${timeSpan}-day journey of self-discovery and growth.`;
  }

  private generateCollectionNarrative(highlights: ProfileHighlight[], timeframe: { start: Date; end: Date }): string {
    const highSignificance = highlights.filter(h => h.significance === 'high').length;
    const timeSpan = Math.ceil((timeframe.end.getTime() - timeframe.start.getTime()) / (1000 * 60 * 60 * 24));

    return `Over the past ${timeSpan} days, your journey has been marked by ${highlights.length} significant moments, including ${highSignificance} breakthrough experiences. This collection captures the key milestones, insights, and growth moments that define your unique path of self-discovery.`;
  }
}
