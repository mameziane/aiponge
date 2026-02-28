import { EntryRecord, InsightRecord } from '@domains/profile';
import { PatternRecord, ProfileAnalyticsRecord } from '@domains/profile';
import {
  UserHighlightData,
  HighlightCategory,
  parseConfidence,
  getHighConfidenceInsights,
} from './highlight-types';
import type { ProfileHighlight } from './GenerateProfileHighlightsUseCase';

export class HighlightIdentificationService {
  identifyAllCandidates(
    userData: UserHighlightData,
    types?: string[],
    categories?: string[]
  ): Partial<ProfileHighlight>[] {
    const candidates: Partial<ProfileHighlight>[] = [];

    candidates.push(...this.identifyBreakthroughInsights(userData.insights));
    candidates.push(...this.identifyMilestoneAchievements(userData));
    candidates.push(...this.identifyPatternDiscoveries(userData.patterns));
    candidates.push(...this.identifyGrowthMoments(userData.analytics, userData.entries));
    candidates.push(...this.identifyTurningPoints(userData.entries, userData.insights));
    candidates.push(...this.identifyReflectionQualityHighlights(userData.entries));
    candidates.push(...this.identifyConsistencyStreaks(userData.entries));

    let filteredCandidates = candidates;

    if (types && types.length > 0) {
      filteredCandidates = filteredCandidates.filter(c => types.includes(c.type!));
    }

    if (categories && categories.length > 0) {
      filteredCandidates = filteredCandidates.filter(c => categories.includes(c.category!));
    }

    return filteredCandidates;
  }

  identifyBreakthroughInsights(insights: InsightRecord[]): Partial<ProfileHighlight>[] {
    return insights
      .filter(insight => parseFloat(insight.confidence || '0') > 0.9 && insight.actionable)
      .map(insight => ({
        type: 'breakthrough_insight' as const,
        title: `Breakthrough: ${insight.title || 'Major Insight'}`,
        description: `Discovered a significant insight with ${Math.round(parseFloat(insight.confidence || '0') * 100)}% confidence`,
        significance: 'high' as const,
        category: this.mapInsightCategoryToHighlightCategory(insight.category),
        date: insight.generatedAt || insight.createdAt,
        relatedContent: {
          entryIds: [insight.entryId].filter(Boolean),
          insightIds: [insight.id],
          patternIds: [],
          analyticsIds: [],
        },
        tags: insight.themes || [],
      }));
  }

  identifyMilestoneAchievements(userData: UserHighlightData): Partial<ProfileHighlight>[] {
    const highlights: Partial<ProfileHighlight>[] = [];

    const entryMilestones = [10, 25, 50, 100, 250, 500, 1000];
    const entryCount = userData.entries.length;

    entryMilestones.forEach(milestone => {
      if (entryCount >= milestone) {
        const milestoneEntry = userData.entries[milestone - 1];
        if (milestoneEntry) {
          highlights.push({
            type: 'milestone_achievement',
            title: `${milestone} Entries Milestone`,
            description: `Reached ${milestone} recorded entries, demonstrating consistent self-reflection practice`,
            significance: milestone >= 100 ? 'high' : milestone >= 50 ? 'medium' : 'low',
            category: 'behavioral',
            date: milestoneEntry.createdAt,
            relatedContent: {
              entryIds: [milestoneEntry.id],
              insightIds: [],
              patternIds: [],
              analyticsIds: [],
            },
            tags: ['milestone', 'consistency', 'achievement'],
          });
        }
      }
    });

    const highConfidenceInsightsList = getHighConfidenceInsights(userData.insights, 0.8);
    if (highConfidenceInsightsList.length >= 10) {
      highlights.push({
        type: 'milestone_achievement',
        title: 'Insight Quality Milestone',
        description: `Generated ${highConfidenceInsightsList.length} high-confidence insights`,
        significance: 'high',
        category: 'cognitive',
        date: new Date(),
        relatedContent: {
          entryIds: [],
          insightIds: highConfidenceInsightsList.map(i => i.id),
          patternIds: [],
          analyticsIds: [],
        },
        tags: ['insight-quality', 'cognitive-growth'],
      });
    }

    return highlights;
  }

  identifyPatternDiscoveries(patterns: PatternRecord[]): Partial<ProfileHighlight>[] {
    return patterns
      .filter(pattern => parseFloat(pattern.strength || '0') > 0.8 && pattern.isActive)
      .map(pattern => ({
        type: 'pattern_discovery',
        title: `Pattern Discovery: ${pattern.patternName}`,
        description: `Identified a strong ${pattern.patternType} pattern with ${Math.round(parseFloat(pattern.strength || '0') * 100)}% strength`,
        significance: parseFloat(pattern.strength || '0') > 0.9 ? 'high' : 'medium',
        category: this.mapPatternTypeToCategory(pattern.patternType),
        date: pattern.firstObserved,
        relatedContent: {
          entryIds: [],
          insightIds: [],
          patternIds: [pattern.id],
          analyticsIds: [],
        },
        tags: ['pattern', pattern.patternType, 'discovery'],
      }));
  }

  identifyGrowthMoments(
    analytics: ProfileAnalyticsRecord[],
    _entries: EntryRecord[]
  ): Partial<ProfileHighlight>[] {
    const highlights: Partial<ProfileHighlight>[] = [];

    analytics.forEach(analytic => {
      const indicators = analytic.progressIndicators as Record<string, unknown> | null;
      const consistencyScore = parseFloat(String(indicators?.consistencyScore || '0'));
      const breakthroughCount = Number(indicators?.breakthroughCount || 0);

      if (consistencyScore > 0.8) {
        highlights.push({
          type: 'growth_moment',
          title: 'Consistency Achievement',
          description: `Achieved ${Math.round(consistencyScore * 100)}% consistency score`,
          significance: 'medium',
          category: 'behavioral',
          date: analytic.computedAt,
          relatedContent: {
            entryIds: [],
            insightIds: [],
            patternIds: [],
            analyticsIds: [analytic.id],
          },
          tags: ['consistency', 'growth', 'achievement'],
        });
      }

      if (breakthroughCount > 5) {
        highlights.push({
          type: 'growth_moment',
          title: 'Breakthrough Period',
          description: `Experienced ${breakthroughCount} breakthrough moments in this period`,
          significance: 'high',
          category: 'cognitive',
          date: analytic.computedAt,
          relatedContent: {
            entryIds: [],
            insightIds: [],
            patternIds: [],
            analyticsIds: [analytic.id],
          },
          tags: ['breakthrough', 'cognitive-growth'],
        });
      }
    });

    return highlights;
  }

  identifyTurningPoints(entries: EntryRecord[], _insights: InsightRecord[]): Partial<ProfileHighlight>[] {
    const highlights: Partial<ProfileHighlight>[] = [];

    const sortedEntries = entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const midPoint = Math.floor(sortedEntries.length / 2);

    if (sortedEntries.length > 20) {
      const earlyEntries = sortedEntries.slice(0, midPoint);
      const laterEntries = sortedEntries.slice(midPoint);

      const earlyPositive = earlyEntries.filter(t => this.isPositiveEntry(t)).length / earlyEntries.length;
      const laterPositive = laterEntries.filter(t => this.isPositiveEntry(t)).length / laterEntries.length;

      if (laterPositive - earlyPositive > 0.3) {
        highlights.push({
          type: 'turning_point',
          title: 'Positive Mindset Shift',
          description: `Significant improvement in positive thinking patterns`,
          significance: 'high',
          category: 'emotional',
          date: laterEntries[0]?.createdAt || new Date(),
          relatedContent: {
            entryIds: laterEntries.slice(0, 5).map(t => t.id),
            insightIds: [],
            patternIds: [],
            analyticsIds: [],
          },
          tags: ['turning-point', 'positivity', 'emotional-growth'],
        });
      }
    }

    return highlights;
  }

  identifyReflectionQualityHighlights(entries: EntryRecord[]): Partial<ProfileHighlight>[] {
    const highlights: Partial<ProfileHighlight>[] = [];

    const highQualityEntries = entries.filter(entry => {
      const wordCount = entry.content.split(/\s+/).length;
      return wordCount > 200;
    });

    if (highQualityEntries.length > 0) {
      const bestEntry = highQualityEntries.reduce((best, current) => {
        const currentWords = current.content.split(/\s+/).length;
        const bestWords = best.content.split(/\s+/).length;
        return currentWords > bestWords ? current : best;
      });

      const bestWordCount = bestEntry.content.split(/\s+/).length;
      highlights.push({
        type: 'reflection_quality',
        title: 'Exceptional Reflection',
        description: `Created an exceptionally detailed and clear reflection with ${bestWordCount} words`,
        significance: 'medium',
        category: 'cognitive',
        date: bestEntry.createdAt,
        relatedContent: {
          entryIds: [bestEntry.id],
          insightIds: [],
          patternIds: [],
          analyticsIds: [],
        },
        tags: ['quality', 'depth', 'reflection'],
      });
    }

    return highlights;
  }

  identifyConsistencyStreaks(entries: EntryRecord[]): Partial<ProfileHighlight>[] {
    const highlights: Partial<ProfileHighlight>[] = [];

    const sortedEntries = entries.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    let currentStreak = 1;
    let maxStreak = 1;
    let streakStart = sortedEntries[0]?.createdAt;
    let maxStreakStart = streakStart;

    for (let i = 1; i < sortedEntries.length; i++) {
      const daysDiff = Math.floor(
        (sortedEntries[i].createdAt.getTime() - sortedEntries[i - 1].createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysDiff <= 2) {
        currentStreak++;
      } else {
        if (currentStreak > maxStreak) {
          maxStreak = currentStreak;
          maxStreakStart = streakStart;
        }
        currentStreak = 1;
        streakStart = sortedEntries[i].createdAt;
      }
    }

    if (currentStreak > maxStreak) {
      maxStreak = currentStreak;
      maxStreakStart = streakStart;
    }

    if (maxStreak >= 7) {
      highlights.push({
        type: 'consistency_streak',
        title: `${maxStreak}-Day Reflection Streak`,
        description: `Maintained consistent reflection practice for ${maxStreak} consecutive days`,
        significance: maxStreak >= 30 ? 'high' : maxStreak >= 14 ? 'medium' : 'low',
        category: 'behavioral',
        date: maxStreakStart || new Date(),
        relatedContent: {
          entryIds: sortedEntries.slice(0, Math.min(maxStreak, 10)).map(t => t.id),
          insightIds: [],
          patternIds: [],
          analyticsIds: [],
        },
        tags: ['consistency', 'streak', 'habit'],
      });
    }

    return highlights;
  }

  isPositiveEntry(entry: EntryRecord): boolean {
    const positiveWords = ['happy', 'grateful', 'excited', 'proud', 'accomplished', 'joy', 'success', 'good', 'great'];
    const content = entry.content.toLowerCase();
    return positiveWords.some(word => content.includes(word));
  }

  mapInsightCategoryToHighlightCategory(category: string): HighlightCategory {
    const categoryMap: Record<string, HighlightCategory> = {
      emotional: 'emotional',
      cognitive: 'cognitive',
      behavioral: 'behavioral',
      social: 'social',
      wellness: 'wellness',
    };
    return categoryMap[category] || 'cognitive';
  }

  mapPatternTypeToCategory(patternType: string): HighlightCategory {
    const categoryMap: Record<string, HighlightCategory> = {
      emotional: 'emotional',
      behavioral: 'behavioral',
      cognitive: 'cognitive',
      temporal: 'behavioral',
      thematic: 'cognitive',
    };
    return categoryMap[patternType] || 'behavioral';
  }
}
