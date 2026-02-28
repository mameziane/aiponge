import { IIntelligenceRepository } from '@domains/intelligence';
import { PersonalNarrative } from '@domains/insights/types';
import { getLogger } from '@config/service-urls';
import { truncateAtSentence } from '../../utils/text';

const logger = getLogger('generate-personal-narrative');

export interface GenerateNarrativeInput {
  userId: string;
}

export interface NarrativeResult {
  narrative: PersonalNarrative;
  isNew: boolean;
  dataPointsSummary: {
    reflections: number;
    moodCheckins: number;
    patterns: number;
    total: number;
  };
}

export interface RespondToNarrativeInput {
  narrativeId: string;
  userId: string;
  userReflection: string;
}

export class GeneratePersonalNarrativeUseCase {
  constructor(private intelligenceRepo: IIntelligenceRepository) {}

  async execute(input: GenerateNarrativeInput): Promise<NarrativeResult> {
    const { userId } = input;

    const existing = await this.intelligenceRepo.findLatestNarrative(userId);
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    if (existing && existing.periodEnd > oneWeekAgo) {
      return {
        narrative: existing,
        isNew: false,
        dataPointsSummary: {
          reflections: 0,
          moodCheckins: 0,
          patterns: 0,
          total: existing.dataPointsUsed,
        },
      };
    }

    const periodStart = existing ? existing.periodEnd : oneWeekAgo;
    const periodEnd = new Date();

    const [reflections, moodCheckins, patterns] = await Promise.all([
      this.intelligenceRepo.findReflectionsByUserId(userId, 50),
      this.intelligenceRepo.findRecentMoodCheckins(userId, 7),
      this.intelligenceRepo.getUserPatterns(userId, { limit: 10 }),
    ]);

    const recentReflections = reflections.filter(
      r => r.createdAt >= periodStart && r.createdAt <= periodEnd
    );

    const breakthroughs = recentReflections.filter(r => r.isBreakthrough);
    const breakthroughIds = breakthroughs.map(b => b.id);

    const totalDataPoints = recentReflections.length + moodCheckins.length + patterns.length;

    const narrativeText = this.buildNarrative(recentReflections, moodCheckins, patterns, breakthroughs);

    const forwardPrompt = this.generateForwardPrompt(recentReflections, moodCheckins, patterns);

    const narrative = await this.intelligenceRepo.createPersonalNarrative({
      userId,
      periodStart,
      periodEnd,
      narrative: narrativeText,
      dataPointsUsed: totalDataPoints,
      breakthroughsReferenced: breakthroughIds.length > 0 ? breakthroughIds : null,
      forwardPrompt,
      metadata: {
        reflectionCount: recentReflections.length,
        moodCheckinCount: moodCheckins.length,
        patternCount: patterns.length,
        breakthroughCount: breakthroughs.length,
      },
    });

    logger.info('Personal narrative generated', {
      narrativeId: narrative.id,
      userId,
      dataPoints: totalDataPoints,
      breakthroughs: breakthroughIds.length,
    });

    return {
      narrative,
      isNew: true,
      dataPointsSummary: {
        reflections: recentReflections.length,
        moodCheckins: moodCheckins.length,
        patterns: patterns.length,
        total: totalDataPoints,
      },
    };
  }

  async respondToNarrative(input: RespondToNarrativeInput): Promise<PersonalNarrative> {
    const { narrativeId, userReflection } = input;
    return this.intelligenceRepo.updateNarrative(narrativeId, { userReflection });
  }

  private buildNarrative(
    reflections: Array<{ challengeQuestion: string; userResponse: string | null; isBreakthrough: boolean | null }>,
    moodCheckins: Array<{ mood: string; emotionalIntensity: number; microQuestionResponse: string | null }>,
    patterns: Array<{ patternName: string; strength: string | null; trend: string | null }>,
    breakthroughs: Array<{ challengeQuestion: string; userResponse: string | null }>
  ): string {
    const parts: string[] = [];

    parts.push('This week in your journey:');

    if (moodCheckins.length > 0) {
      const moodCounts: Record<string, number> = {};
      for (const c of moodCheckins) {
        moodCounts[c.mood] = (moodCounts[c.mood] || 0) + 1;
      }
      const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0];
      const avgIntensity = Math.round(moodCheckins.reduce((sum, c) => sum + c.emotionalIntensity, 0) / moodCheckins.length);
      parts.push(`You checked in ${moodCheckins.length} times. Your most frequent mood was "${topMood[0]}" (${topMood[1]} times), with an average intensity of ${avgIntensity}/10.`);
    }

    if (reflections.length > 0) {
      parts.push(`You reflected ${reflections.length} times, exploring questions about your inner world.`);
    }

    if (breakthroughs.length > 0) {
      parts.push(`You had ${breakthroughs.length} breakthrough moment${breakthroughs.length > 1 ? 's' : ''} - moments of deeper understanding.`);
    }

    if (patterns.length > 0) {
      const activePatterns = patterns.filter(p => p.strength === 'strong' || p.strength === 'very_strong');
      if (activePatterns.length > 0) {
        parts.push(`Strong patterns in your journey: ${activePatterns.map(p => p.patternName).join(', ')}.`);
      }
    }

    const excerpts = this.collectUserExcerpts(reflections, breakthroughs, moodCheckins);
    if (excerpts.length > 0) {
      parts.push('In your own words:\n' + excerpts.join('\n'));
    }

    if (parts.length === 1) {
      parts.push('This was a quiet week for reflection. Every journey has its own pace.');
    }

    return parts.join('\n\n');
  }

  private collectUserExcerpts(
    reflections: Array<{ userResponse: string | null }>,
    breakthroughs: Array<{ userResponse: string | null }>,
    moodCheckins: Array<{ microQuestionResponse: string | null }>
  ): string[] {
    const excerpts: string[] = [];

    const firstReflectionResponse = reflections.find(r => r.userResponse?.trim())?.userResponse;
    if (firstReflectionResponse) {
      excerpts.push(`"${truncateAtSentence(firstReflectionResponse.trim(), 120)}"`);
    }

    const firstBreakthroughResponse = breakthroughs.find(b => b.userResponse?.trim())?.userResponse;
    if (firstBreakthroughResponse && firstBreakthroughResponse !== firstReflectionResponse) {
      excerpts.push(`"${truncateAtSentence(firstBreakthroughResponse.trim(), 120)}"`);
    }

    const firstMoodResponse = moodCheckins.find(m => m.microQuestionResponse?.trim())?.microQuestionResponse;
    if (firstMoodResponse) {
      excerpts.push(`"${truncateAtSentence(firstMoodResponse.trim(), 120)}"`);
    }

    return excerpts;
  }

  private generateForwardPrompt(
    reflections: Array<{ userResponse: string | null; isBreakthrough: boolean | null }>,
    moodCheckins: Array<{ mood: string }>,
    patterns: Array<{ patternName: string; trend: string | null }>
  ): string {
    if (reflections.some(r => r.isBreakthrough)) {
      return 'You had a breakthrough this week. How would you like to build on that insight in the coming days?';
    }

    const growingPatterns = patterns.filter(p => p.trend === 'increasing');
    if (growingPatterns.length > 0) {
      return `Your "${growingPatterns[0].patternName}" pattern is growing. What does that mean to you?`;
    }

    if (moodCheckins.length > 5) {
      return 'You\'ve been checking in frequently - that shows real commitment. What\'s one thing you\'d like to understand better about yourself this week?';
    }

    return 'As you move into the next week, what aspect of yourself would you like to explore more deeply?';
  }
}
