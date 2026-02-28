import { InsightRecord, EntryRecord } from '@domains/profile';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import {
  UserHighlightData,
  HighlightFilters,
  parseConfidence,
  filterEntriesByIds,
  filterInsightsByIds,
} from './highlight-types';
import type { ProfileHighlight } from './GenerateProfileHighlightsUseCase';

export class HighlightScoringService {
  scoreHighlightCandidates(candidates: Partial<ProfileHighlight>[], userData: UserHighlightData): ProfileHighlight[] {
    return candidates.map(candidate => {
      const impactScore = this.calculateImpactScore(candidate, userData);
      const rarityScore = this.calculateRarityScore(candidate, candidates);
      const growthContribution = this.calculateGrowthContribution(candidate, userData);
      const qualityScore = this.calculateQualityScore(candidate, userData);

      return {
        ...candidate,
        id: this.generateHighlightId(candidate.userId!, candidate.type!),
        userId: candidate.userId!,
        type: candidate.type!,
        title: candidate.title!,
        description: candidate.description!,
        significance: candidate.significance!,
        category: candidate.category!,
        date: candidate.date!,
        timeframe: {
          start: candidate.date!,
          end: candidate.date!,
        },
        relatedContent: candidate.relatedContent!,
        metrics: {
          impactScore,
          rarityScore,
          growthContribution,
          qualityScore,
        },
        narrative: {
          summary: '',
          context: '',
          impact: '',
          futureImplications: '',
        },
        tags: candidate.tags || [],
        visibility: CONTENT_VISIBILITY.PERSONAL,
        isFeatured: false,
        createdAt: new Date(),
      } as ProfileHighlight;
    });
  }

  calculateImpactScore(candidate: Partial<ProfileHighlight>, _userData: UserHighlightData): number {
    let score = 50;

    if (candidate.significance === 'high') score += 30;
    else if (candidate.significance === 'medium') score += 15;

    if (candidate.type === 'breakthrough_insight') score += 20;
    else if (candidate.type === 'turning_point') score += 25;
    else if (candidate.type === 'milestone_achievement') score += 15;

    const relatedCount = Object.values(candidate.relatedContent || {}).flat().length;
    score += Math.min(20, relatedCount * 2);

    return Math.min(100, Math.max(0, score));
  }

  calculateRarityScore(candidate: Partial<ProfileHighlight>, allCandidates: Partial<ProfileHighlight>[]): number {
    const typeCount = allCandidates.filter(c => c.type === candidate.type).length;
    const categoryCount = allCandidates.filter(c => c.category === candidate.category).length;

    const typeRarity = Math.max(0, 100 - typeCount * 10);
    const categoryRarity = Math.max(0, 100 - categoryCount * 5);

    return Math.round((typeRarity + categoryRarity) / 2);
  }

  calculateGrowthContribution(candidate: Partial<ProfileHighlight>, _userData: UserHighlightData): number {
    let contribution = 50;

    if (candidate.type === 'breakthrough_insight' || candidate.type === 'turning_point') {
      contribution += 30;
    } else if (candidate.type === 'growth_moment') {
      contribution += 20;
    } else if (candidate.type === 'consistency_streak') {
      contribution += 15;
    }

    return Math.min(100, contribution);
  }

  calculateQualityScore(candidate: Partial<ProfileHighlight>, userData: UserHighlightData): number {
    let score = 60;

    const relatedContent = candidate.relatedContent;
    if (relatedContent?.insightIds.length) {
      const insights = filterInsightsByIds(userData.insights, relatedContent.insightIds);
      const avgConfidence =
        insights.length > 0
          ? insights.reduce((sum: number, i: InsightRecord) => sum + parseConfidence(i.confidence), 0) / insights.length
          : 0;
      score += avgConfidence * 30;
    }

    if (relatedContent?.entryIds.length) {
      const entries = filterEntriesByIds(userData.entries, relatedContent.entryIds);
      const avgQuality =
        entries.length > 0
          ? entries.reduce((sum: number, t: EntryRecord) => {
              const wordCount = t.content.split(/\s+/).length;
              return sum + (wordCount > 100 ? 1 : 0.5);
            }, 0) / entries.length
          : 0;
      score += avgQuality * 20;
    }

    return Math.min(100, Math.max(0, score));
  }

  filterHighlights(
    highlights: ProfileHighlight[],
    minSignificance: string,
    customFilters?: HighlightFilters
  ): ProfileHighlight[] {
    let filtered = highlights;

    const significanceOrder = { low: 0, medium: 1, high: 2 };
    const minSigLevel = significanceOrder[minSignificance as keyof typeof significanceOrder];
    filtered = filtered.filter(h => significanceOrder[h.significance] >= minSigLevel);

    if (customFilters) {
      if (customFilters.minImpactScore) {
        filtered = filtered.filter(h => h.metrics.impactScore >= customFilters.minImpactScore!);
      }

      if (customFilters.minRarityScore) {
        filtered = filtered.filter(h => h.metrics.rarityScore >= customFilters.minRarityScore!);
      }
    }

    return filtered;
  }

  selectTopHighlights(highlights: ProfileHighlight[], maxCount: number): ProfileHighlight[] {
    return highlights
      .sort((a, b) => {
        const scoreA = a.metrics.impactScore * 0.4 + a.metrics.rarityScore * 0.3 + a.metrics.growthContribution * 0.3;
        const scoreB = b.metrics.impactScore * 0.4 + b.metrics.rarityScore * 0.3 + b.metrics.growthContribution * 0.3;
        return scoreB - scoreA;
      })
      .slice(0, maxCount);
  }

  private generateHighlightId(userId: string, type: string): string {
    const { randomUUID } = require('crypto');
    return `highlight_${userId}_${type}_${Date.now()}_${randomUUID()}`;
  }
}
