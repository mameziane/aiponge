/**
 * Intelligence Repository Interface
 * Entries, Insights, Reflections, Patterns, Analytics
 *
 */

import { Entry, InsertEntry, Chapter, InsertChapter, Illustration } from '@domains/library/types';
import { Insight, NewInsight, Reflection, NewReflection, ReflectionTurn, NewReflectionTurn, UserPattern, ProfileAnalytics, PatternReaction, NewPatternReaction, MoodCheckin, NewMoodCheckin, PersonalNarrative, NewPersonalNarrative } from '@domains/insights/types';

export interface EntryFilter {
  isArchived?: boolean;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  entryType?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface InsightFilter {
  category?: string;
  type?: string;
  entryId?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  limit?: number;
  offset?: number;
}

export interface PatternFilter {
  type?: string;
  minConfidence?: number;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  limit?: number;
}

export interface AnalyticsFilter {
  eventType?: string;
  dateFrom?: Date | string;
  dateTo?: Date | string;
  limit?: number;
}

export interface AnalyticsEvent {
  userId: string;
  eventType: string;
  eventData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  timestamp?: Date;
}

export interface IIntelligenceRepository {
  // Chapters
  createChapter(chapter: InsertChapter): Promise<Chapter>;

  // Entries
  createEntry(entry: InsertEntry): Promise<Entry>;
  findEntryById(id: string): Promise<Entry | null>;
  findEntriesByIds(ids: string[], userId?: string): Promise<Entry[]>;
  findEntriesByUserId(userId: string, limit?: number, offset?: number, bookId?: string): Promise<Entry[]>;
  countEntriesByUserId(userId: string, bookId?: string): Promise<number>;
  updateEntry(id: string, data: Partial<Entry>): Promise<Entry>;
  updateEntriesBatch(ids: string[], data: Partial<Entry>): Promise<number>;
  deleteEntry(id: string): Promise<void>;
  getEntriesByUser(userId: string, filter?: EntryFilter): Promise<Entry[]>;
  getMaxChapterSortOrder(chapterId: string): Promise<number>;

  // Entry Illustrations - max 4 per entry
  addEntryIllustration(entryId: string, url: string): Promise<Illustration>;
  findEntryIllustrations(entryId: string): Promise<Illustration[]>;
  findEntryIllustrationsByEntryIds(entryIds: string[]): Promise<Map<string, Illustration[]>>;
  removeEntryIllustration(illustrationId: string): Promise<void>;
  reorderEntryIllustrations(entryId: string, illustrationIds: string[]): Promise<Illustration[]>;

  // Insights
  createInsight(insight: NewInsight): Promise<Insight>;
  createInsightsBulk(insights: NewInsight[]): Promise<Insight[]>;
  findInsightsByUserId(userId: string, limit?: number): Promise<Insight[]>;
  findInsightsByEntryId(entryId: string): Promise<Insight[]>;
  getInsightsByUser(userId: string, filter?: InsightFilter): Promise<Insight[]>;

  // Reflections
  createReflection(reflection: NewReflection): Promise<Reflection>;
  findReflectionById(reflectionId: string, userId: string): Promise<Reflection | null>;
  findReflectionsByUserId(userId: string, limit?: number): Promise<Reflection[]>;
  updateReflection(id: string, data: Partial<Reflection>): Promise<Reflection>;

  // Reflection Turns (Multi-turn Dialogue)
  createReflectionTurn(turn: NewReflectionTurn): Promise<ReflectionTurn>;
  findReflectionTurnsByReflectionId(reflectionId: string): Promise<ReflectionTurn[]>;
  updateReflectionTurn(id: string, data: Partial<ReflectionTurn>): Promise<ReflectionTurn>;
  getMaxTurnNumber(reflectionId: string): Promise<number>;

  // Patterns and Analytics
  getUserPatterns(userId: string, filter?: PatternFilter): Promise<UserPattern[]>;
  getProfileAnalytics(userId: string, filter?: AnalyticsFilter): Promise<ProfileAnalytics[]>;
  recordAnalyticsEvent(event: AnalyticsEvent): Promise<void>;
  getAnalyticsEvents(filter?: AnalyticsFilter): Promise<AnalyticsEvent[]>;

  // Pattern Reactions
  createPatternReaction(reaction: NewPatternReaction): Promise<PatternReaction>;
  findPatternReactionsByPatternId(patternId: string, userId: string): Promise<PatternReaction[]>;
  findPatternReactionsByUserId(userId: string, limit?: number): Promise<PatternReaction[]>;
  getPatternById(patternId: string, userId: string): Promise<UserPattern | null>;
  updatePattern(id: string, data: Partial<UserPattern>): Promise<UserPattern>;

  // Mood Check-ins
  createMoodCheckin(checkin: NewMoodCheckin): Promise<MoodCheckin>;
  findMoodCheckinsByUserId(userId: string, limit?: number): Promise<MoodCheckin[]>;
  updateMoodCheckin(id: string, data: Partial<MoodCheckin>): Promise<MoodCheckin>;
  findRecentMoodCheckins(userId: string, days: number): Promise<MoodCheckin[]>;

  // Personal Narratives
  createPersonalNarrative(narrative: NewPersonalNarrative): Promise<PersonalNarrative>;
  findLatestNarrative(userId: string): Promise<PersonalNarrative | null>;
  findNarrativesByUserId(userId: string, limit?: number): Promise<PersonalNarrative[]>;
  updateNarrative(id: string, data: Partial<PersonalNarrative>): Promise<PersonalNarrative>;
}
