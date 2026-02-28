/**
 * Pattern Recognition Service
 * Analyzes user entries to detect emotional, temporal, and thematic patterns
 */

import { getLogger } from '@config/service-urls';
import type {
  IPatternAnalysisPort,
  EntryForAnalysis,
  PatternInsight,
} from '@domains/profile/ports/IPatternAnalysisPort';
import type { NewUserPattern } from '@domains/insights/types';

const logger = getLogger('pattern-recognition-service');

interface EmotionalPattern {
  mood: string;
  count: number;
  averageIntensity: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

interface TemporalPattern {
  dayOfWeek: number;
  hourOfDay: number;
  count: number;
  dominantMood: string | null;
  dominantSentiment: string | null;
}

interface ThematicPattern {
  theme: string;
  count: number;
  sentimentDistribution: Record<string, number>;
  relatedThemes: string[];
}

export class PatternRecognitionService {
  constructor(private patternRepository: IPatternAnalysisPort) {}

  async analyzeUserPatterns(userId: string): Promise<PatternInsight[]> {
    logger.info('Starting pattern analysis', { userId });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const entries = await this.patternRepository.getUserEntries(userId, thirtyDaysAgo);

    if (entries.length < 5) {
      logger.info('Insufficient entries for pattern analysis', { userId, entryCount: entries.length });
      return [];
    }

    const patterns: PatternInsight[] = [];

    const emotionalPatterns = await this.detectEmotionalPatterns(userId, entries);
    patterns.push(...emotionalPatterns);

    const temporalPatterns = await this.detectTemporalPatterns(userId, entries);
    patterns.push(...temporalPatterns);

    const thematicPatterns = await this.detectThematicPatterns(userId, entries);
    patterns.push(...thematicPatterns);

    await this.extractAndTrackThemes(userId, entries);

    const now = new Date();
    const weekNumber = this.getISOWeekNumber(now);
    const period = `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
    const allThemes = patterns.flatMap(p => p.relatedThemes);
    const uniqueThemes = Array.from(new Set(allThemes));

    try {
      await this.patternRepository.upsertMetrics(userId, period, patterns.length, uniqueThemes);
    } catch (error) {
      logger.error('Failed to upsert profile metrics', { userId, period, error });
    }

    logger.info('Pattern analysis complete', { userId, patternsFound: patterns.length });
    return patterns;
  }

  private async detectEmotionalPatterns(userId: string, entries: EntryForAnalysis[]): Promise<PatternInsight[]> {
    const patterns: PatternInsight[] = [];
    const moodCounts: Record<string, { count: number; totalIntensity: number; timestamps: Date[] }> = {};

    for (const entry of entries) {
      const mood = entry.moodContext || entry.sentiment || 'neutral';
      if (!moodCounts[mood]) {
        moodCounts[mood] = { count: 0, totalIntensity: 0, timestamps: [] };
      }
      moodCounts[mood].count++;
      moodCounts[mood].totalIntensity += entry.emotionalIntensity || 5;
      moodCounts[mood].timestamps.push(entry.createdAt);
    }

    for (const [mood, data] of Object.entries(moodCounts)) {
      if (data.count < 3) continue;

      const frequency = data.count / entries.length;
      if (frequency < 0.15) continue;

      const trend = this.calculateTrend(data.timestamps, entries);
      const avgIntensity = data.totalIntensity / data.count;
      const strength = Math.min(1, frequency * (avgIntensity / 10));

      const moodEntries = entries.filter(t => (t.moodContext || t.sentiment) === mood);
      const relatedThemes = this.extractRelatedThemes(moodEntries);
      const evidenceEntryIds = moodEntries.slice(0, 20).map(e => e.id);

      const pattern: NewUserPattern = {
        userId,
        patternType: 'emotional',
        patternName: `Recurring ${mood} mood`,
        description: `You experience ${mood} feelings in ${Math.round(frequency * 100)}% of your reflections`,
        frequency: data.count,
        strength: strength.toFixed(2),
        trend,
        relatedThemes: relatedThemes,
        triggerFactors: [],
        evidenceEntryIds,
      };

      await this.patternRepository.upsertPattern(pattern);

      patterns.push({
        patternType: 'emotional',
        patternName: pattern.patternName,
        description: pattern.description || '',
        frequency: data.count,
        strength,
        trend,
        relatedThemes,
        triggerFactors: [],
      });
    }

    return patterns;
  }

  private async detectTemporalPatterns(userId: string, entries: EntryForAnalysis[]): Promise<PatternInsight[]> {
    const patterns: PatternInsight[] = [];

    const dayPatterns: Record<number, { count: number; moods: string[]; sentiments: string[]; entryIds: string[] }> = {};
    const hourPatterns: Record<number, { count: number; moods: string[]; sentiments: string[]; entryIds: string[] }> = {};

    for (const entry of entries) {
      const date = new Date(entry.createdAt);
      const dayOfWeek = date.getDay();
      const hourOfDay = date.getHours();

      if (!dayPatterns[dayOfWeek]) {
        dayPatterns[dayOfWeek] = { count: 0, moods: [], sentiments: [], entryIds: [] };
      }
      dayPatterns[dayOfWeek].count++;
      dayPatterns[dayOfWeek].entryIds.push(entry.id);
      if (entry.moodContext) dayPatterns[dayOfWeek].moods.push(entry.moodContext);
      if (entry.sentiment) dayPatterns[dayOfWeek].sentiments.push(entry.sentiment);

      const hourBucket = Math.floor(hourOfDay / 4) * 4;
      if (!hourPatterns[hourBucket]) {
        hourPatterns[hourBucket] = { count: 0, moods: [], sentiments: [], entryIds: [] };
      }
      hourPatterns[hourBucket].count++;
      hourPatterns[hourBucket].entryIds.push(entry.id);
      if (entry.moodContext) hourPatterns[hourBucket].moods.push(entry.moodContext);
      if (entry.sentiment) hourPatterns[hourBucket].sentiments.push(entry.sentiment);
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const avgPerDay = entries.length / 7;

    for (const [day, data] of Object.entries(dayPatterns)) {
      const dayNum = parseInt(day);
      if (data.count > avgPerDay * 1.5 && data.count >= 3) {
        const dominantMood = this.getMostFrequent(data.moods);
        const strength = Math.min(1, data.count / (avgPerDay * 3));

        const pattern: NewUserPattern = {
          userId,
          patternType: 'temporal',
          patternName: `${dayNames[dayNum]} reflection pattern`,
          description: `You tend to reflect more on ${dayNames[dayNum]}s${dominantMood ? `, often feeling ${dominantMood}` : ''}`,
          frequency: data.count,
          strength: strength.toFixed(2),
          trend: 'stable',
          relatedThemes: [],
          triggerFactors: [dayNames[dayNum]],
          evidenceEntryIds: data.entryIds.slice(0, 20),
        };

        await this.patternRepository.upsertPattern(pattern);

        patterns.push({
          patternType: 'temporal',
          patternName: pattern.patternName,
          description: pattern.description || '',
          frequency: data.count,
          strength,
          trend: 'stable',
          relatedThemes: [],
          triggerFactors: [dayNames[dayNum]],
        });
      }
    }

    const timeLabels: Record<number, string> = {
      0: 'late night (12am-4am)',
      4: 'early morning (4am-8am)',
      8: 'morning (8am-12pm)',
      12: 'afternoon (12pm-4pm)',
      16: 'evening (4pm-8pm)',
      20: 'night (8pm-12am)',
    };

    const avgPerBucket = entries.length / 6;

    for (const [hour, data] of Object.entries(hourPatterns)) {
      const hourNum = parseInt(hour);
      if (data.count > avgPerBucket * 1.5 && data.count >= 3) {
        const dominantMood = this.getMostFrequent(data.moods);
        const strength = Math.min(1, data.count / (avgPerBucket * 3));
        const timeLabel = timeLabels[hourNum] || `${hourNum}:00-${hourNum + 4}:00`;

        const pattern: NewUserPattern = {
          userId,
          patternType: 'temporal',
          patternName: `${timeLabel} reflection pattern`,
          description: `You often reflect during ${timeLabel}${dominantMood ? `, typically feeling ${dominantMood}` : ''}`,
          frequency: data.count,
          strength: strength.toFixed(2),
          trend: 'stable',
          relatedThemes: [],
          triggerFactors: [timeLabel],
          evidenceEntryIds: data.entryIds.slice(0, 20),
        };

        await this.patternRepository.upsertPattern(pattern);

        patterns.push({
          patternType: 'temporal',
          patternName: pattern.patternName,
          description: pattern.description || '',
          frequency: data.count,
          strength,
          trend: 'stable',
          relatedThemes: [],
          triggerFactors: [timeLabel],
        });
      }
    }

    return patterns;
  }

  private async detectThematicPatterns(userId: string, entries: EntryForAnalysis[]): Promise<PatternInsight[]> {
    const patterns: PatternInsight[] = [];
    const themeCounts: Record<string, { count: number; sentiments: string[]; relatedTags: string[]; entryIds: string[] }> = {};

    const themeKeywords: Record<string, string[]> = {
      relationships: ['love', 'friend', 'family', 'partner', 'relationship', 'connection', 'lonely', 'together'],
      career: ['work', 'job', 'career', 'boss', 'colleague', 'project', 'meeting', 'deadline', 'promotion'],
      health: ['health', 'exercise', 'sleep', 'tired', 'energy', 'sick', 'body', 'fitness', 'wellness'],
      growth: ['learn', 'grow', 'improve', 'change', 'goal', 'progress', 'better', 'develop', 'achieve'],
      stress: ['stress', 'anxious', 'worry', 'overwhelm', 'pressure', 'nervous', 'tense', 'fear'],
      gratitude: ['grateful', 'thankful', 'appreciate', 'blessed', 'lucky', 'fortunate', 'joy'],
      creativity: ['create', 'idea', 'imagine', 'inspire', 'art', 'music', 'write', 'design'],
      spirituality: ['spirit', 'soul', 'meaning', 'purpose', 'faith', 'meditate', 'peace', 'mindful'],
    };

    for (const entry of entries) {
      const contentLower = entry.content.toLowerCase();

      for (const [theme, keywords] of Object.entries(themeKeywords)) {
        const matchCount = keywords.filter(k => contentLower.includes(k)).length;
        if (matchCount > 0) {
          if (!themeCounts[theme]) {
            themeCounts[theme] = { count: 0, sentiments: [], relatedTags: [], entryIds: [] };
          }
          themeCounts[theme].count += matchCount;
          themeCounts[theme].entryIds.push(entry.id);
          if (entry.sentiment) themeCounts[theme].sentiments.push(entry.sentiment);
          themeCounts[theme].relatedTags.push(...(entry.tags || []));
        }
      }
    }

    for (const [theme, data] of Object.entries(themeCounts)) {
      if (data.count < 3) continue;

      const frequency = data.count;
      const strength = Math.min(1, frequency / (entries.length * 0.5));
      const dominantSentiment = this.getMostFrequent(data.sentiments);

      const uniqueTags = Array.from(new Set(data.relatedTags)).slice(0, 5);

      const pattern: NewUserPattern = {
        userId,
        patternType: 'thematic',
        patternName: `${theme.charAt(0).toUpperCase() + theme.slice(1)} focus`,
        description: `${theme.charAt(0).toUpperCase() + theme.slice(1)} is a recurring theme in your reflections${dominantSentiment ? `, often with ${dominantSentiment} sentiment` : ''}`,
        frequency,
        strength: strength.toFixed(2),
        trend: 'stable',
        relatedThemes: uniqueTags,
        triggerFactors: [],
        evidenceEntryIds: data.entryIds.slice(0, 20),
      };

      await this.patternRepository.upsertPattern(pattern);

      patterns.push({
        patternType: 'thematic',
        patternName: pattern.patternName,
        description: pattern.description || '',
        frequency,
        strength,
        trend: 'stable',
        relatedThemes: uniqueTags,
        triggerFactors: [],
      });
    }

    return patterns;
  }

  private async extractAndTrackThemes(userId: string, entries: EntryForAnalysis[]): Promise<void> {
    const allTags = entries.flatMap(t => t.tags || []);
    const tagCounts: Record<string, number> = {};

    for (const tag of allTags) {
      const normalized = tag.toLowerCase().trim();
      if (normalized) {
        tagCounts[normalized] = (tagCounts[normalized] || 0) + 1;
      }
    }

    for (const [theme] of Object.entries(tagCounts)) {
      await this.patternRepository.upsertThemeFrequency(userId, theme);
    }

    const wordCounts: Record<string, number> = {};
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'dare',
      'ought',
      'used',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'as',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'between',
      'under',
      'again',
      'further',
      'then',
      'once',
      'here',
      'there',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'few',
      'more',
      'most',
      'other',
      'some',
      'such',
      'no',
      'nor',
      'not',
      'only',
      'own',
      'same',
      'so',
      'than',
      'too',
      'very',
      'just',
      'and',
      'but',
      'or',
      'if',
      'because',
      'until',
      'while',
      'although',
      'i',
      'me',
      'my',
      'myself',
      'we',
      'our',
      'you',
      'your',
      'he',
      'him',
      'his',
      'she',
      'her',
      'it',
      'its',
      'they',
      'them',
      'their',
      'what',
      'which',
      'who',
      'whom',
      'this',
      'that',
      'these',
      'those',
      'am',
      'been',
      'being',
      'about',
      'also',
      'back',
      'even',
      'first',
      'get',
      'go',
      'got',
      'know',
      'like',
      'make',
      'much',
      'new',
      'now',
      'one',
      'out',
      'over',
      'see',
      'think',
      'time',
      'up',
      'want',
      'way',
      'well',
      'really',
      'feel',
      'feeling',
      'today',
      'day',
      'dont',
      "don't",
      'im',
      "i'm",
      'ive',
      "i've",
    ]);

    for (const entry of entries) {
      const words = entry.content.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
      for (const word of words) {
        if (!stopWords.has(word)) {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        }
      }
    }

    const significantWords = Object.entries(wordCounts)
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);

    for (const [word] of significantWords) {
      await this.patternRepository.upsertThemeFrequency(userId, word);
    }

    logger.debug('Theme extraction complete', {
      userId,
      themesTracked: significantWords.length + Object.keys(tagCounts).length,
    });
  }

  private calculateTrend(timestamps: Date[], allEntries: EntryForAnalysis[]): 'increasing' | 'decreasing' | 'stable' {
    if (timestamps.length < 3) return 'stable';

    const now = new Date();
    const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);

    const recentCount = timestamps.filter(t => t >= fifteenDaysAgo).length;
    const olderCount = timestamps.filter(t => t < fifteenDaysAgo).length;

    if (recentCount === 0 && olderCount === 0) return 'stable';
    if (olderCount === 0) return 'increasing';
    if (recentCount === 0) return 'decreasing';

    const ratio = recentCount / olderCount;
    if (ratio > 1.3) return 'increasing';
    if (ratio < 0.7) return 'decreasing';
    return 'stable';
  }

  private extractRelatedThemes(entries: EntryForAnalysis[]): string[] {
    const themes: Record<string, number> = {};
    for (const entry of entries) {
      for (const tag of entry.tags || []) {
        themes[tag] = (themes[tag] || 0) + 1;
      }
    }
    return Object.entries(themes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([theme]) => theme);
  }

  private getISOWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }

  private getMostFrequent(items: string[]): string | null {
    if (items.length === 0) return null;
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item] = (counts[item] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  async runBatchAnalysis(): Promise<{ usersAnalyzed: number; patternsFound: number }> {
    logger.info('Starting batch pattern analysis');

    const userIds = await this.patternRepository.getAllUsersWithEntries(5);
    let totalPatterns = 0;

    for (const userId of userIds) {
      try {
        const patterns = await this.analyzeUserPatterns(userId);
        totalPatterns += patterns.length;
      } catch (error) {
        logger.error('Failed to analyze patterns for user', { userId, error });
      }
    }

    logger.info('Batch pattern analysis complete', { usersAnalyzed: userIds.length, patternsFound: totalPatterns });
    return { usersAnalyzed: userIds.length, patternsFound: totalPatterns };
  }
}
