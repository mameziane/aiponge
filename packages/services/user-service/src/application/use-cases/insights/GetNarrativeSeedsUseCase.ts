/**
 * Get Narrative Seeds Use Case
 * Extracts personalized narrative context from user's recent book entries
 * Used by music-service to generate hyper-personalized lyrics
 */

import { getLogger } from '@config/service-urls';

const logger = getLogger('user-service-get-narrative-seeds');

export interface NarrativeSeed {
  keyword: string;
  frequency: number;
  source: 'content' | 'tag' | 'sentiment' | 'mood' | 'type';
  emotionalWeight: number;
}

export interface NarrativeSeedsRequest {
  userId: string;
  maxSeeds?: number;
  timeframeDays?: number;
  includeEmotionalContext?: boolean;
}

export interface NarrativeSeedsResponse {
  userId: string;
  seeds: NarrativeSeed[];
  emotionalProfile: {
    dominantMood: string | null;
    dominantSentiment: string | null;
    emotionalIntensityAvg: number;
  };
  entryCount: number;
  timeframe: {
    start: Date;
    end: Date;
  };
  generatedAt: string;
}

interface IIntelligenceRepository {
  findEntriesByUserId(userId: string, limit?: number, offset?: number): Promise<Entry[]>;
}

interface Entry {
  id: string;
  userId: string;
  content: string;
  entryType: string;
  moodContext?: string | null;
  sentiment?: string | null;
  emotionalIntensity?: number | null;
  tags?: string[] | null;
  createdAt: Date;
}

export class GetNarrativeSeedsUseCase {
  constructor(private readonly intelligenceRepo: IIntelligenceRepository) {}

  async execute(request: NarrativeSeedsRequest): Promise<NarrativeSeedsResponse> {
    const { userId, maxSeeds = 20, timeframeDays = 30, includeEmotionalContext = true } = request;

    logger.info('Extracting narrative seeds for user', { userId, maxSeeds, timeframeDays });

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - timeframeDays * 24 * 60 * 60 * 1000);

    const entries = await this.intelligenceRepo.findEntriesByUserId(userId, 100, 0);

    const recentEntries = entries.filter(t => new Date(t.createdAt) >= startDate);

    if (recentEntries.length === 0) {
      logger.info('No recent entries found for user', { userId });
      return {
        userId,
        seeds: [],
        emotionalProfile: {
          dominantMood: null,
          dominantSentiment: null,
          emotionalIntensityAvg: 0,
        },
        entryCount: 0,
        timeframe: { start: startDate, end: endDate },
        generatedAt: new Date().toISOString(),
      };
    }

    const seedMap = new Map<string, NarrativeSeed>();

    for (const entry of recentEntries) {
      const contentKeywords = this.extractKeywordsFromContent(entry.content);
      for (const keyword of contentKeywords) {
        this.addOrUpdateSeed(seedMap, keyword, 'content', 1.0);
      }

      if (entry.tags && entry.tags.length > 0) {
        for (const tag of entry.tags) {
          this.addOrUpdateSeed(seedMap, tag.toLowerCase(), 'tag', 1.5);
        }
      }

      if (entry.moodContext) {
        this.addOrUpdateSeed(seedMap, entry.moodContext.toLowerCase(), 'mood', 2.0);
      }

      if (entry.sentiment) {
        this.addOrUpdateSeed(seedMap, entry.sentiment.toLowerCase(), 'sentiment', 1.2);
      }

      if (entry.entryType) {
        this.addOrUpdateSeed(seedMap, entry.entryType.toLowerCase(), 'type', 0.8);
      }
    }

    const sortedSeeds = Array.from(seedMap.values())
      .sort((a, b) => b.emotionalWeight * b.frequency - a.emotionalWeight * a.frequency)
      .slice(0, maxSeeds);

    const emotionalProfile = includeEmotionalContext
      ? this.calculateEmotionalProfile(recentEntries)
      : { dominantMood: null, dominantSentiment: null, emotionalIntensityAvg: 0 };

    logger.info('Narrative seeds extracted', {
      userId,
      seedCount: sortedSeeds.length,
      entryCount: recentEntries.length,
    });

    return {
      userId,
      seeds: sortedSeeds,
      emotionalProfile,
      entryCount: recentEntries.length,
      timeframe: { start: startDate, end: endDate },
      generatedAt: new Date().toISOString(),
    };
  }

  private extractKeywordsFromContent(content: string): string[] {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'with',
      'by',
      'from',
      'as',
      'is',
      'was',
      'are',
      'were',
      'been',
      'be',
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
      'it',
      'its',
      'this',
      'that',
      'these',
      'those',
      'i',
      'me',
      'my',
      'myself',
      'we',
      'our',
      'ours',
      'you',
      'your',
      'yours',
      'he',
      'him',
      'his',
      'she',
      'her',
      'hers',
      'they',
      'them',
      'their',
      'theirs',
      'what',
      'which',
      'who',
      'whom',
      'when',
      'where',
      'why',
      'how',
      'all',
      'each',
      'every',
      'both',
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
      'also',
      'now',
      'here',
      'there',
      'then',
      'once',
      'if',
      'because',
      'until',
      'while',
      'about',
      'into',
      'through',
      'during',
      'before',
      'after',
      'above',
      'below',
      'up',
      'down',
      'out',
      'off',
      'over',
      'under',
      'again',
      'further',
      'im',
      'ive',
      'dont',
      'cant',
      'wont',
      'didnt',
      'isnt',
      'arent',
      'wasnt',
      'werent',
      'hasnt',
      'havent',
      'hadnt',
      'doesnt',
      'didnt',
      'wouldnt',
      'shouldnt',
      'couldnt',
      'mustnt',
      'lets',
      'thats',
      'whos',
      'whats',
      'heres',
      'theres',
      'whens',
      'wheres',
      'whys',
      'hows',
      'really',
      'like',
      'just',
      'even',
      'still',
      'today',
      'yesterday',
      'tomorrow',
      'always',
      'never',
      'sometimes',
      'often',
      'usually',
      'feel',
      'feeling',
      'felt',
      'think',
      'thinking',
      'thought',
      'know',
      'knowing',
      'knew',
      'want',
      'wanting',
      'wanted',
      'need',
      'needing',
      'needed',
      'get',
      'getting',
      'got',
      'make',
      'making',
      'made',
      'going',
      'went',
      'gone',
      'come',
      'coming',
      'came',
      'take',
      'taking',
      'took',
      'see',
      'seeing',
      'saw',
      'seem',
      'seeming',
      'seemed',
    ]);

    const words = content
      .toLowerCase()
      .replace(/[^a-z\s'-]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.has(word));

    const uniqueWords = [...new Set(words)];
    return uniqueWords.slice(0, 10);
  }

  private addOrUpdateSeed(
    seedMap: Map<string, NarrativeSeed>,
    keyword: string,
    source: NarrativeSeed['source'],
    weight: number
  ): void {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (normalizedKeyword.length < 2) return;

    const existing = seedMap.get(normalizedKeyword);
    if (existing) {
      existing.frequency += 1;
      existing.emotionalWeight = Math.max(existing.emotionalWeight, weight);
    } else {
      seedMap.set(normalizedKeyword, {
        keyword: normalizedKeyword,
        frequency: 1,
        source,
        emotionalWeight: weight,
      });
    }
  }

  private calculateEmotionalProfile(entries: Entry[]): {
    dominantMood: string | null;
    dominantSentiment: string | null;
    emotionalIntensityAvg: number;
  } {
    const moodCounts = new Map<string, number>();
    const sentimentCounts = new Map<string, number>();
    let totalIntensity = 0;
    let intensityCount = 0;

    for (const entry of entries) {
      if (entry.moodContext) {
        const mood = entry.moodContext.toLowerCase();
        moodCounts.set(mood, (moodCounts.get(mood) || 0) + 1);
      }

      if (entry.sentiment) {
        const sentiment = entry.sentiment.toLowerCase();
        sentimentCounts.set(sentiment, (sentimentCounts.get(sentiment) || 0) + 1);
      }

      if (entry.emotionalIntensity !== null && entry.emotionalIntensity !== undefined) {
        totalIntensity += entry.emotionalIntensity;
        intensityCount++;
      }
    }

    let dominantMood: string | null = null;
    let maxMoodCount = 0;
    for (const [mood, count] of moodCounts) {
      if (count > maxMoodCount) {
        dominantMood = mood;
        maxMoodCount = count;
      }
    }

    let dominantSentiment: string | null = null;
    let maxSentimentCount = 0;
    for (const [sentiment, count] of sentimentCounts) {
      if (count > maxSentimentCount) {
        dominantSentiment = sentiment;
        maxSentimentCount = count;
      }
    }

    return {
      dominantMood,
      dominantSentiment,
      emotionalIntensityAvg: intensityCount > 0 ? totalIntensity / intensityCount : 0,
    };
  }
}
