import { DatabaseConnection } from '../../database/DatabaseConnectionFactory';
import {
  IIntelligenceRepository,
  EntryFilter,
  InsightFilter,
  PatternFilter,
  AnalyticsFilter,
  AnalyticsEvent,
} from '../../../domains/intelligence/repositories/IIntelligenceRepository';
import { EntryRepositoryPart } from './EntryRepositoryImpl';
import { InsightRepositoryPart } from './InsightRepositoryImpl';
import { ReflectionRepositoryPart } from './ReflectionRepositoryImpl';
import { MoodCheckinRepositoryPart } from './MoodCheckinRepositoryImpl';
import { NarrativeRepositoryPart } from './NarrativeRepositoryImpl';
import { ChapterRepositoryPart } from './ChapterRepositoryImpl';
import { AnalyticsRepositoryPart, type AnalyticsEventFilter } from './AnalyticsRepositoryImpl';

import type { Entry, InsertEntry, Chapter, InsertChapter, Illustration } from '../../../domains/library/types';
import type {
  Insight,
  NewInsight,
  Reflection,
  NewReflection,
  ReflectionTurn,
  NewReflectionTurn,
  UserPattern,
  ProfileAnalytics,
  PatternReaction,
  NewPatternReaction,
  MoodCheckin,
  NewMoodCheckin,
  PersonalNarrative,
  NewPersonalNarrative,
} from '../../../domains/insights/types';

export class IntelligenceRepository implements IIntelligenceRepository {
  private readonly entries: EntryRepositoryPart;
  private readonly insightsPart: InsightRepositoryPart;
  private readonly reflectionsPart: ReflectionRepositoryPart;
  private readonly moodCheckins: MoodCheckinRepositoryPart;
  private readonly narratives: NarrativeRepositoryPart;
  private readonly chaptersPart: ChapterRepositoryPart;
  private readonly analytics: AnalyticsRepositoryPart;

  constructor(db: DatabaseConnection) {
    this.entries = new EntryRepositoryPart(db);
    this.insightsPart = new InsightRepositoryPart(db);
    this.reflectionsPart = new ReflectionRepositoryPart(db);
    this.moodCheckins = new MoodCheckinRepositoryPart(db);
    this.narratives = new NarrativeRepositoryPart(db);
    this.chaptersPart = new ChapterRepositoryPart(db);
    this.analytics = new AnalyticsRepositoryPart(db);
  }

  createEntry(entryData: InsertEntry): Promise<Entry> {
    return this.entries.createEntry(entryData);
  }

  findEntryById(id: string): Promise<Entry | null> {
    return this.entries.findEntryById(id);
  }

  findEntriesByIds(ids: string[], userId?: string): Promise<Entry[]> {
    return this.entries.findEntriesByIds(ids, userId);
  }

  findEntriesByUserId(userId: string, limit?: number, offset?: number, bookId?: string): Promise<Entry[]> {
    return this.entries.findEntriesByUserId(userId, limit, offset, bookId);
  }

  countEntriesByUserId(userId: string, bookId?: string): Promise<number> {
    return this.entries.countEntriesByUserId(userId, bookId);
  }

  findEntriesByChapterId(chapterId: string): Promise<Entry[]> {
    return this.entries.findEntriesByChapterId(chapterId);
  }

  updateEntry(id: string, data: Partial<Entry>): Promise<Entry> {
    return this.entries.updateEntry(id, data);
  }

  deleteEntry(id: string): Promise<void> {
    return this.entries.deleteEntry(id);
  }

  addEntryIllustration(entryId: string, url: string): Promise<Illustration> {
    return this.entries.addEntryIllustration(entryId, url);
  }

  findEntryIllustrations(entryId: string): Promise<Illustration[]> {
    return this.entries.findEntryIllustrations(entryId);
  }

  findEntryIllustrationsByEntryIds(entryIds: string[]): Promise<Map<string, Illustration[]>> {
    return this.entries.findEntryIllustrationsByEntryIds(entryIds);
  }

  removeEntryIllustration(illustrationId: string): Promise<void> {
    return this.entries.removeEntryIllustration(illustrationId);
  }

  reorderEntryIllustrations(entryId: string, illustrationIds: string[]): Promise<Illustration[]> {
    return this.entries.reorderEntryIllustrations(entryId, illustrationIds);
  }

  updateEntriesBatch(ids: string[], data: Partial<Entry>): Promise<number> {
    return this.entries.updateEntriesBatch(ids, data);
  }

  getEntriesByUser(userId: string, filter?: EntryFilter): Promise<Entry[]> {
    return this.entries.getEntriesByUser(userId, filter);
  }

  createInsight(insightData: NewInsight): Promise<Insight> {
    return this.insightsPart.createInsight(insightData);
  }

  createInsightsBulk(insightsData: NewInsight[]): Promise<Insight[]> {
    return this.insightsPart.createInsightsBulk(insightsData);
  }

  findInsightsByUserId(userId: string, limit?: number): Promise<Insight[]> {
    return this.insightsPart.findInsightsByUserId(userId, limit);
  }

  findInsightsByEntryId(entryId: string): Promise<Insight[]> {
    return this.insightsPart.findInsightsByEntryId(entryId);
  }

  getInsightsByUser(userId: string, filter?: InsightFilter): Promise<Insight[]> {
    return this.insightsPart.getInsightsByUser(userId, filter);
  }

  createReflection(reflectionData: NewReflection): Promise<Reflection> {
    return this.reflectionsPart.createReflection(reflectionData);
  }

  findReflectionsByUserId(userId: string, limit?: number): Promise<Reflection[]> {
    return this.reflectionsPart.findReflectionsByUserId(userId, limit);
  }

  updateReflection(id: string, data: Partial<Reflection>): Promise<Reflection> {
    return this.reflectionsPart.updateReflection(id, data);
  }

  findReflectionById(id: string, userId: string): Promise<Reflection | null> {
    return this.reflectionsPart.findReflectionById(id, userId);
  }

  deleteReflection(id: string, userId: string): Promise<void> {
    return this.reflectionsPart.deleteReflection(id, userId);
  }

  createReflectionTurn(turnData: NewReflectionTurn): Promise<ReflectionTurn> {
    return this.reflectionsPart.createReflectionTurn(turnData);
  }

  findReflectionTurnsByReflectionId(reflectionId: string): Promise<ReflectionTurn[]> {
    return this.reflectionsPart.findReflectionTurnsByReflectionId(reflectionId);
  }

  updateReflectionTurn(id: string, data: Partial<ReflectionTurn>): Promise<ReflectionTurn> {
    return this.reflectionsPart.updateReflectionTurn(id, data);
  }

  getMaxTurnNumber(reflectionId: string): Promise<number> {
    return this.reflectionsPart.getMaxTurnNumber(reflectionId);
  }

  getUserPatterns(userId: string, filter?: PatternFilter): Promise<UserPattern[]> {
    return this.analytics.getUserPatterns(userId, filter);
  }

  createPatternReaction(reactionData: NewPatternReaction): Promise<PatternReaction> {
    return this.analytics.createPatternReaction(reactionData);
  }

  findPatternReactionsByPatternId(patternId: string, userId: string): Promise<PatternReaction[]> {
    return this.analytics.findPatternReactionsByPatternId(patternId, userId);
  }

  findPatternReactionsByUserId(userId: string, limit?: number): Promise<PatternReaction[]> {
    return this.analytics.findPatternReactionsByUserId(userId, limit);
  }

  createMoodCheckin(checkinData: NewMoodCheckin): Promise<MoodCheckin> {
    return this.moodCheckins.createMoodCheckin(checkinData);
  }

  findMoodCheckinsByUserId(userId: string, limit?: number): Promise<MoodCheckin[]> {
    return this.moodCheckins.findMoodCheckinsByUserId(userId, limit);
  }

  updateMoodCheckin(id: string, data: Partial<MoodCheckin>): Promise<MoodCheckin> {
    return this.moodCheckins.updateMoodCheckin(id, data);
  }

  findRecentMoodCheckins(userId: string, days: number): Promise<MoodCheckin[]> {
    return this.moodCheckins.findRecentMoodCheckins(userId, days);
  }

  createPersonalNarrative(narrativeData: NewPersonalNarrative): Promise<PersonalNarrative> {
    return this.narratives.createPersonalNarrative(narrativeData);
  }

  findLatestNarrative(userId: string): Promise<PersonalNarrative | null> {
    return this.narratives.findLatestNarrative(userId);
  }

  findNarrativesByUserId(userId: string, limit?: number): Promise<PersonalNarrative[]> {
    return this.narratives.findNarrativesByUserId(userId, limit);
  }

  updateNarrative(id: string, data: Partial<PersonalNarrative>): Promise<PersonalNarrative> {
    return this.narratives.updateNarrative(id, data);
  }

  getPatternById(patternId: string, userId: string): Promise<UserPattern | null> {
    return this.analytics.getPatternById(patternId, userId);
  }

  updatePattern(id: string, data: Partial<UserPattern>): Promise<UserPattern> {
    return this.analytics.updatePattern(id, data);
  }

  getProfileAnalytics(userId: string, filter?: AnalyticsFilter): Promise<ProfileAnalytics[]> {
    return this.analytics.getProfileAnalytics(userId, filter);
  }

  recordAnalyticsEvent(event: AnalyticsEvent): Promise<void> {
    return this.analytics.recordAnalyticsEvent(event);
  }

  getAnalyticsEvents(filter?: AnalyticsFilter | AnalyticsEventFilter): Promise<AnalyticsEvent[]> {
    return this.analytics.getAnalyticsEvents(filter);
  }

  createChapter(chapterData: InsertChapter): Promise<Chapter> {
    return this.chaptersPart.createChapter(chapterData);
  }

  findChaptersByUserId(userId: string, bookId?: string): Promise<Chapter[]> {
    return this.chaptersPart.findChaptersByUserId(userId, bookId);
  }

  findChapterById(id: string): Promise<Chapter | null> {
    return this.chaptersPart.findChapterById(id);
  }

  findChapterByUserIdAndTitle(userId: string, title: string): Promise<Chapter | null> {
    return this.chaptersPart.findChapterByUserIdAndTitle(userId, title);
  }

  updateChapter(id: string, data: Partial<Chapter>): Promise<Chapter> {
    return this.chaptersPart.updateChapter(id, data);
  }

  deleteChapter(id: string): Promise<void> {
    return this.chaptersPart.deleteChapter(id);
  }

  assignEntriesToChapter(entryIds: string[], chapterId: string | null, userId: string): Promise<void> {
    return this.chaptersPart.assignEntriesToChapter(entryIds, chapterId, userId);
  }

  updateEntryChapterOrder(entryId: string, sortOrder: number, userId: string): Promise<void> {
    return this.chaptersPart.updateEntryChapterOrder(entryId, sortOrder, userId);
  }

  getMaxChapterSortOrder(chapterId: string): Promise<number> {
    return this.chaptersPart.getMaxChapterSortOrder(chapterId);
  }
}
