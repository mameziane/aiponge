import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../config/service-urls', () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@aiponge/platform-core', () => ({
  serializeError: vi.fn((err: unknown) => err),
  errorMessage: vi.fn((err: unknown) => (err instanceof Error ? err.message : String(err))),
  errorStack: vi.fn((err: unknown) => (err instanceof Error ? err.stack : '')),
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  DomainErrorCode: {},
  createDomainServiceError: vi.fn(
    () =>
      class MockDomainError extends Error {
        public readonly statusCode: number;
        public readonly code?: string;
        constructor(message: string, statusCode: number = 500, code?: string, _cause?: Error) {
          super(message);
          this.statusCode = statusCode;
          this.code = code;
        }
      }
  ),
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
}));

vi.mock('@aiponge/shared-contracts', () => ({
  GOAL_STATUS: { ACTIVE: 'active', COMPLETED: 'completed', PAUSED: 'paused', ABANDONED: 'abandoned' },
}));

vi.mock('../../../application/use-cases/insights/wellness-dimension-calculators', () => ({
  calculateEmotionalWellness: vi.fn(() => ({ score: 72, label: 'emotional', indicators: [] })),
  calculateCognitiveWellness: vi.fn(() => ({ score: 68, label: 'cognitive', indicators: [] })),
  calculateBehavioralWellness: vi.fn(() => ({ score: 75, label: 'behavioral', indicators: [] })),
  calculateSocialWellness: vi.fn(() => ({ score: 60, label: 'social', indicators: [] })),
  calculatePhysicalWellness: vi.fn(() => ({ score: 65, label: 'physical', indicators: [] })),
  calculateSpiritualWellness: vi.fn(() => ({ score: 70, label: 'spiritual', indicators: [] })),
}));

vi.mock('../../../application/use-cases/insights/wellness-scoring', () => ({
  calculateOverallWellnessScore: vi.fn(() => 70),
  determineWellnessGrade: vi.fn(() => 'B'),
  generateWellnessTrends: vi.fn(() => []),
  generateWellnessInsights: vi.fn(() => []),
  createWellnessSummary: vi.fn(() => 'Good overall wellness'),
  generateWellnessComparison: vi.fn(() => ({ previous: 65, current: 70, change: 5 })),
  generateWellnessAlerts: vi.fn(() => []),
  calculateConfidenceMetrics: vi.fn(() => ({ dataPoints: 10, reliability: 0.8 })),
}));

vi.mock('../../../application/use-cases/profile/highlight-types', () => ({
  parseConfidence: vi.fn((c: string | null) => parseFloat(c || '0')),
  parseStrength: vi.fn((s: string | null) => parseFloat(s || '0')),
}));

import { CreateInsightUseCase } from '../../../application/use-cases/insights/CreateInsightUseCase';
import { GetInsightsUseCase } from '../../../application/use-cases/insights/GetInsightsUseCase';
import { CreateReflectionUseCase } from '../../../application/use-cases/insights/CreateReflectionUseCase';
import { ContinueReflectionDialogueUseCase } from '../../../application/use-cases/insights/ContinueReflectionDialogueUseCase';
import { RecordMoodCheckInUseCase } from '../../../application/use-cases/insights/RecordMoodCheckInUseCase';
import { CalculateUserWellnessScoreUseCase } from '../../../application/use-cases/insights/CalculateUserWellnessScoreUseCase';
import { ExplorePatternUseCase } from '../../../application/use-cases/insights/ExplorePatternUseCase';
import { GeneratePersonalNarrativeUseCase } from '../../../application/use-cases/insights/GeneratePersonalNarrativeUseCase';
import { GetNarrativeSeedsUseCase } from '../../../application/use-cases/insights/GetNarrativeSeedsUseCase';
import { UpdateUserGoalsFromInsightsUseCase } from '../../../application/use-cases/insights/UpdateUserGoalsFromInsightsUseCase';

function createMockIntelligenceRepository() {
  return {
    createChapter: vi.fn(),
    createEntry: vi.fn(),
    findEntryById: vi.fn(),
    findEntriesByIds: vi.fn(),
    findEntriesByUserId: vi.fn(),
    countEntriesByUserId: vi.fn(),
    updateEntry: vi.fn(),
    updateEntriesBatch: vi.fn(),
    deleteEntry: vi.fn(),
    getEntriesByUser: vi.fn(),
    getMaxChapterSortOrder: vi.fn(),
    addEntryIllustration: vi.fn(),
    findEntryIllustrations: vi.fn(),
    findEntryIllustrationsByEntryIds: vi.fn(),
    removeEntryIllustration: vi.fn(),
    reorderEntryIllustrations: vi.fn(),
    createInsight: vi.fn(),
    createInsightsBulk: vi.fn(),
    findInsightsByUserId: vi.fn(),
    findInsightsByEntryId: vi.fn(),
    getInsightsByUser: vi.fn(),
    createReflection: vi.fn(),
    findReflectionById: vi.fn(),
    findReflectionsByUserId: vi.fn(),
    updateReflection: vi.fn(),
    createReflectionTurn: vi.fn(),
    findReflectionTurnsByReflectionId: vi.fn(),
    updateReflectionTurn: vi.fn(),
    getMaxTurnNumber: vi.fn(),
    getUserPatterns: vi.fn(),
    getProfileAnalytics: vi.fn(),
    recordAnalyticsEvent: vi.fn(),
    getAnalyticsEvents: vi.fn(),
    createPatternReaction: vi.fn(),
    findPatternReactionsByPatternId: vi.fn(),
    findPatternReactionsByUserId: vi.fn(),
    getPatternById: vi.fn(),
    updatePattern: vi.fn(),
    createMoodCheckin: vi.fn(),
    findMoodCheckinsByUserId: vi.fn(),
    updateMoodCheckin: vi.fn(),
    findRecentMoodCheckins: vi.fn(),
    createPersonalNarrative: vi.fn(),
    findLatestNarrative: vi.fn(),
    findNarrativesByUserId: vi.fn(),
    updateNarrative: vi.fn(),
  };
}

function createMockProfileRepository() {
  return {
    createProfile: vi.fn(),
    findProfileByUserId: vi.fn(),
    updateProfile: vi.fn(),
    getProfile: vi.fn(),
    getProfileSummary: vi.fn(),
    incrementInsights: vi.fn(),
    incrementReflections: vi.fn(),
    incrementEntries: vi.fn(),
    getPublicMemberStats: vi.fn(),
    getUserBasicInfo: vi.fn(),
  };
}

function createMockEntryRepository() {
  return {
    getEntriesByUser: vi.fn().mockResolvedValue([]),
    getInsightsByUser: vi.fn().mockResolvedValue([]),
  };
}

function createMockAnalysisRepository() {
  return {
    getUserPatterns: vi.fn().mockResolvedValue([]),
    getProfileAnalytics: vi.fn().mockResolvedValue([]),
    recordAnalyticsEvent: vi.fn().mockResolvedValue(undefined),
  };
}

const TEST_USER_ID = 'user-123';
const TEST_ENTRY_ID = 'entry-456';

describe('Insights Use Cases', () => {
  describe('CreateInsightUseCase', () => {
    let useCase: CreateInsightUseCase;
    let mockIntelligenceRepo: ReturnType<typeof createMockIntelligenceRepository>;
    let mockProfileRepo: ReturnType<typeof createMockProfileRepository>;

    beforeEach(() => {
      mockIntelligenceRepo = createMockIntelligenceRepository();
      mockProfileRepo = createMockProfileRepository();
      useCase = new CreateInsightUseCase(mockIntelligenceRepo, mockProfileRepo);
    });

    it('should create an insight and update profile metrics', async () => {
      const newInsight = {
        userId: TEST_USER_ID,
        type: 'emotional',
        title: 'Emotional Pattern',
        content: 'You show a pattern of emotional awareness',
      };
      const createdInsight = { id: 'insight-1', ...newInsight, entryId: null, confidence: '0.8', category: 'emotional', themes: null, actionable: true, priority: 1, aiProvider: null, aiModel: null, generatedAt: new Date(), validatedAt: null, validatedBy: null, metadata: null, createdAt: new Date(), deletedAt: null };

      mockIntelligenceRepo.createInsight.mockResolvedValue(createdInsight);
      mockProfileRepo.incrementInsights.mockResolvedValue(undefined);

      const result = await useCase.execute(newInsight);

      expect(result).toEqual(createdInsight);
      expect(mockIntelligenceRepo.createInsight).toHaveBeenCalledWith(newInsight);
      expect(mockProfileRepo.incrementInsights).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it('should return insight even if profile metric update fails', async () => {
      const newInsight = { userId: TEST_USER_ID, type: 'cognitive', title: 'Test', content: 'Content' };
      const createdInsight = { id: 'insight-2', ...newInsight, entryId: null, confidence: null, category: null, themes: null, actionable: null, priority: null, aiProvider: null, aiModel: null, generatedAt: new Date(), validatedAt: null, validatedBy: null, metadata: null, createdAt: new Date(), deletedAt: null };

      mockIntelligenceRepo.createInsight.mockResolvedValue(createdInsight);
      mockProfileRepo.incrementInsights.mockRejectedValue(new Error('DB error'));

      const result = await useCase.execute(newInsight);

      expect(result).toEqual(createdInsight);
      expect(mockProfileRepo.incrementInsights).toHaveBeenCalled();
    });

    it('should propagate error if insight creation fails', async () => {
      const newInsight = { userId: TEST_USER_ID, type: 'test', title: 'Test', content: 'Content' };
      mockIntelligenceRepo.createInsight.mockRejectedValue(new Error('Creation failed'));

      await expect(useCase.execute(newInsight)).rejects.toThrow('Creation failed');
    });
  });

  describe('GetInsightsUseCase', () => {
    let useCase: GetInsightsUseCase;
    let mockIntelligenceRepo: ReturnType<typeof createMockIntelligenceRepository>;

    beforeEach(() => {
      mockIntelligenceRepo = createMockIntelligenceRepository();
      useCase = new GetInsightsUseCase(mockIntelligenceRepo);
    });

    it('should retrieve insights by userId and return summary', async () => {
      const insights = [
        { id: 'i1', userId: TEST_USER_ID, entryId: null, type: 'emotional', title: 'T1', content: 'C1', confidence: '0.9', category: 'emotional', themes: null, actionable: true, priority: 1, aiProvider: null, aiModel: null, generatedAt: new Date(), validatedAt: null, validatedBy: null, metadata: null, createdAt: new Date(), deletedAt: null },
        { id: 'i2', userId: TEST_USER_ID, entryId: null, type: 'cognitive', title: 'T2', content: 'C2', confidence: '0.5', category: 'cognitive', themes: null, actionable: false, priority: 2, aiProvider: null, aiModel: null, generatedAt: new Date(), validatedAt: null, validatedBy: null, metadata: null, createdAt: new Date(), deletedAt: null },
      ];
      mockIntelligenceRepo.findInsightsByUserId.mockResolvedValue(insights);

      const result = await useCase.execute({ userId: TEST_USER_ID });

      expect(result.insights).toEqual(insights);
      expect(result.summary.totalInsights).toBe(2);
      expect(result.summary.highConfidenceInsights).toBe(1);
      expect(result.summary.averageConfidence).toBe(0.7);
      expect(result.summary.insightsByType).toEqual({ emotional: 1, cognitive: 1 });
    });

    it('should retrieve insights by entryId', async () => {
      const insights = [
        { id: 'i1', userId: TEST_USER_ID, entryId: TEST_ENTRY_ID, type: 'emotional', title: 'T1', content: 'C1', confidence: '0.8', category: 'emotional', themes: null, actionable: true, priority: 1, aiProvider: null, aiModel: null, generatedAt: new Date(), validatedAt: null, validatedBy: null, metadata: null, createdAt: new Date(), deletedAt: null },
      ];
      mockIntelligenceRepo.findInsightsByEntryId.mockResolvedValue(insights);

      const result = await useCase.execute({ userId: TEST_USER_ID, entryId: TEST_ENTRY_ID });

      expect(result.insights).toEqual(insights);
      expect(mockIntelligenceRepo.findInsightsByEntryId).toHaveBeenCalledWith(TEST_ENTRY_ID);
    });

    it('should throw when userId is empty', async () => {
      await expect(useCase.execute({ userId: '' })).rejects.toThrow();
    });

    it('should throw ownership error if entry insights belong to another user', async () => {
      const insights = [
        { id: 'i1', userId: 'other-user', entryId: TEST_ENTRY_ID, type: 'emotional', title: 'T1', content: 'C1', confidence: '0.8', category: 'emotional', themes: null, actionable: true, priority: 1, aiProvider: null, aiModel: null, generatedAt: new Date(), validatedAt: null, validatedBy: null, metadata: null, createdAt: new Date(), deletedAt: null },
      ];
      mockIntelligenceRepo.findInsightsByEntryId.mockResolvedValue(insights);

      await expect(useCase.execute({ userId: TEST_USER_ID, entryId: TEST_ENTRY_ID })).rejects.toThrow();
    });
  });

  describe('CreateReflectionUseCase', () => {
    let useCase: CreateReflectionUseCase;
    let mockIntelligenceRepo: ReturnType<typeof createMockIntelligenceRepository>;
    let mockProfileRepo: ReturnType<typeof createMockProfileRepository>;

    beforeEach(() => {
      mockIntelligenceRepo = createMockIntelligenceRepository();
      mockProfileRepo = createMockProfileRepository();
      useCase = new CreateReflectionUseCase(mockIntelligenceRepo, mockProfileRepo);
    });

    it('should create a reflection and update profile metrics', async () => {
      const newReflection = { userId: TEST_USER_ID, challengeQuestion: 'What matters most to you?' };
      const createdReflection = { id: 'ref-1', ...newReflection, userResponse: null, followUpQuestions: null, isBreakthrough: null, engagementLevel: null, responseTime: null, submittedAt: null, createdAt: new Date(), deletedAt: null };

      mockIntelligenceRepo.createReflection.mockResolvedValue(createdReflection);
      mockProfileRepo.incrementReflections.mockResolvedValue(undefined);

      const result = await useCase.execute(newReflection);

      expect(result).toEqual(createdReflection);
      expect(mockIntelligenceRepo.createReflection).toHaveBeenCalledWith(newReflection);
      expect(mockProfileRepo.incrementReflections).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it('should return reflection even if profile update fails', async () => {
      const newReflection = { userId: TEST_USER_ID, challengeQuestion: 'What do you value?' };
      const createdReflection = { id: 'ref-2', ...newReflection, userResponse: null, followUpQuestions: null, isBreakthrough: null, engagementLevel: null, responseTime: null, submittedAt: null, createdAt: new Date(), deletedAt: null };

      mockIntelligenceRepo.createReflection.mockResolvedValue(createdReflection);
      mockProfileRepo.incrementReflections.mockRejectedValue(new Error('Profile DB error'));

      const result = await useCase.execute(newReflection);
      expect(result).toEqual(createdReflection);
    });

    it('should propagate error if reflection creation fails', async () => {
      mockIntelligenceRepo.createReflection.mockRejectedValue(new Error('DB failed'));
      await expect(useCase.execute({ userId: TEST_USER_ID, challengeQuestion: 'Q?' })).rejects.toThrow('DB failed');
    });
  });

  describe('ContinueReflectionDialogueUseCase', () => {
    let useCase: ContinueReflectionDialogueUseCase;
    let mockIntelligenceRepo: ReturnType<typeof createMockIntelligenceRepository>;

    beforeEach(() => {
      mockIntelligenceRepo = createMockIntelligenceRepository();
      useCase = new ContinueReflectionDialogueUseCase(mockIntelligenceRepo);
    });

    it('should continue dialogue by answering an unanswered turn', async () => {
      const reflection = { id: 'ref-1', userId: TEST_USER_ID, challengeQuestion: 'What do you think?', userResponse: null, followUpQuestions: null, isBreakthrough: false, engagementLevel: null, responseTime: null, submittedAt: null, createdAt: new Date(), deletedAt: null };
      const unansweredTurn = { id: 'turn-1', reflectionId: 'ref-1', turnNumber: 1, question: 'What do you think?', response: null, microInsight: null, therapeuticFramework: 'cognitive-behavioral', respondedAt: null, createdAt: new Date() };
      const answeredTurn = { ...unansweredTurn, response: 'I feel good about it', microInsight: 'Each reflection brings you closer to understanding yourself better.', respondedAt: new Date() };
      const nextTurn = { id: 'turn-2', reflectionId: 'ref-1', turnNumber: 2, question: 'How does this connect to other areas of your life?', response: null, microInsight: null, therapeuticFramework: 'acceptance-commitment', respondedAt: null, createdAt: new Date() };

      mockIntelligenceRepo.findReflectionById.mockResolvedValue(reflection);
      mockIntelligenceRepo.findReflectionTurnsByReflectionId
        .mockResolvedValueOnce([unansweredTurn])
        .mockResolvedValueOnce([answeredTurn, nextTurn]);
      mockIntelligenceRepo.getMaxTurnNumber.mockResolvedValue(1);
      mockIntelligenceRepo.updateReflectionTurn.mockResolvedValue(answeredTurn);
      mockIntelligenceRepo.createReflectionTurn.mockResolvedValue(nextTurn);

      const result = await useCase.execute({
        reflectionId: 'ref-1',
        userId: TEST_USER_ID,
        userResponse: 'I feel good about it',
      });

      expect(result.latestTurn).toEqual(answeredTurn);
      expect(result.nextQuestion).toEqual(nextTurn);
      expect(result.isBreakthrough).toBe(false);
      expect(mockIntelligenceRepo.updateReflectionTurn).toHaveBeenCalled();
    });

    it('should throw when reflection is not found', async () => {
      mockIntelligenceRepo.findReflectionById.mockResolvedValue(null);

      await expect(useCase.execute({
        reflectionId: 'nonexistent',
        userId: TEST_USER_ID,
        userResponse: 'response',
      })).rejects.toThrow();
    });

    it('should detect breakthrough when indicators and depth are present', async () => {
      const reflection = { id: 'ref-1', userId: TEST_USER_ID, challengeQuestion: 'What patterns do you see?', userResponse: null, followUpQuestions: null, isBreakthrough: false, engagementLevel: null, responseTime: null, submittedAt: null, createdAt: new Date(), deletedAt: null };
      const existingTurns = [
        { id: 't1', reflectionId: 'ref-1', turnNumber: 1, question: 'Q1', response: 'R1', microInsight: 'M1', therapeuticFramework: 'cbt', respondedAt: new Date(), createdAt: new Date() },
        { id: 't2', reflectionId: 'ref-1', turnNumber: 2, question: 'Q2', response: 'R2', microInsight: 'M2', therapeuticFramework: 'cbt', respondedAt: new Date(), createdAt: new Date() },
      ];
      const unansweredTurn = { id: 't3', reflectionId: 'ref-1', turnNumber: 3, question: 'Q3', response: null, microInsight: null, therapeuticFramework: 'cbt', respondedAt: null, createdAt: new Date() };
      const breakthroughResponse = 'I finally realize that I have been avoiding this pattern my entire life and now I understand now that the connection between my feelings and my actions is much deeper than I thought and this makes sense to me in a way it never did before';

      const answeredTurn = { ...unansweredTurn, response: breakthroughResponse, microInsight: 'You explored this topic in depth', respondedAt: new Date() };

      mockIntelligenceRepo.findReflectionById.mockResolvedValue(reflection);
      mockIntelligenceRepo.findReflectionTurnsByReflectionId
        .mockResolvedValueOnce([...existingTurns, unansweredTurn])
        .mockResolvedValueOnce([...existingTurns, answeredTurn]);
      mockIntelligenceRepo.getMaxTurnNumber.mockResolvedValue(3);
      mockIntelligenceRepo.updateReflectionTurn.mockResolvedValue(answeredTurn);
      mockIntelligenceRepo.updateReflection.mockResolvedValue({ ...reflection, isBreakthrough: true });
      mockIntelligenceRepo.createInsight.mockResolvedValue({ id: 'insight-bt-1', userId: TEST_USER_ID, type: 'self_discovered', title: 'Breakthrough', content: breakthroughResponse, category: 'breakthrough', confidence: 'high', actionable: false, generatedAt: new Date(), createdAt: new Date() });

      const result = await useCase.execute({
        reflectionId: 'ref-1',
        userId: TEST_USER_ID,
        userResponse: breakthroughResponse,
      });

      expect(result.isBreakthrough).toBe(true);
      expect(result.synthesis).toBeTruthy();
      expect(result.savedInsightId).toBe('insight-bt-1');
      expect(mockIntelligenceRepo.updateReflection).toHaveBeenCalledWith('ref-1', { isBreakthrough: true });
      expect(mockIntelligenceRepo.createInsight).toHaveBeenCalledWith(expect.objectContaining({ type: 'self_discovered', category: 'breakthrough' }));
    });
  });

  describe('RecordMoodCheckInUseCase', () => {
    let useCase: RecordMoodCheckInUseCase;
    let mockIntelligenceRepo: ReturnType<typeof createMockIntelligenceRepository>;

    beforeEach(() => {
      mockIntelligenceRepo = createMockIntelligenceRepository();
      useCase = new RecordMoodCheckInUseCase(mockIntelligenceRepo);
    });

    it('should record a mood check-in with pattern connection', async () => {
      const pattern = { id: 'pat-1', userId: TEST_USER_ID, patternType: 'emotional', patternName: 'Happy moments', description: null, frequency: 5, strength: 'moderate', trend: 'increasing', firstObserved: new Date(), lastObserved: new Date(), relatedThemes: ['joy'], triggerFactors: null, isActive: true, evidenceEntryIds: null, explorationPrompt: null, metadata: null, createdAt: new Date(), updatedAt: new Date() };
      const checkin = { id: 'mc-1', userId: TEST_USER_ID, mood: 'happy', emotionalIntensity: 7, content: null, triggerTag: null, microQuestion: 'How can you create more moments like this?', microQuestionResponse: null, patternConnectionId: 'pat-1', linkedReflectionId: null, respondedAt: null, createdAt: new Date() };

      mockIntelligenceRepo.findRecentMoodCheckins.mockResolvedValue([]);
      mockIntelligenceRepo.getUserPatterns.mockResolvedValue([pattern]);
      mockIntelligenceRepo.createMoodCheckin.mockResolvedValue(checkin);

      const result = await useCase.execute({
        userId: TEST_USER_ID,
        mood: 'happy',
        emotionalIntensity: 7,
      });

      expect(result.checkin).toEqual(checkin);
      expect(result.patternConnection.connected).toBe(true);
      expect(result.patternConnection.patternId).toBe('pat-1');
      expect(result.microQuestion).toBeTruthy();
    });

    it('should clamp emotional intensity to valid range', async () => {
      mockIntelligenceRepo.findRecentMoodCheckins.mockResolvedValue([]);
      mockIntelligenceRepo.getUserPatterns.mockResolvedValue([]);
      mockIntelligenceRepo.createMoodCheckin.mockImplementation(async (data) => ({
        id: 'mc-2',
        ...data,
        microQuestionResponse: null,
        linkedReflectionId: null,
        respondedAt: null,
        createdAt: new Date(),
      }));

      const result = await useCase.execute({
        userId: TEST_USER_ID,
        mood: 'anxious',
        emotionalIntensity: 15,
      });

      expect(result.checkin.emotionalIntensity).toBe(10);
    });

    it('should detect emerging pattern when same mood is logged frequently', async () => {
      const recentCheckins = [
        { id: 'mc-a', userId: TEST_USER_ID, mood: 'sad', emotionalIntensity: 5, content: null, triggerTag: null, microQuestion: null, microQuestionResponse: null, patternConnectionId: null, linkedReflectionId: null, respondedAt: null, createdAt: new Date() },
        { id: 'mc-b', userId: TEST_USER_ID, mood: 'sad', emotionalIntensity: 6, content: null, triggerTag: null, microQuestion: null, microQuestionResponse: null, patternConnectionId: null, linkedReflectionId: null, respondedAt: null, createdAt: new Date() },
        { id: 'mc-c', userId: TEST_USER_ID, mood: 'sad', emotionalIntensity: 4, content: null, triggerTag: null, microQuestion: null, microQuestionResponse: null, patternConnectionId: null, linkedReflectionId: null, respondedAt: null, createdAt: new Date() },
      ];
      mockIntelligenceRepo.findRecentMoodCheckins.mockResolvedValue(recentCheckins);
      mockIntelligenceRepo.getUserPatterns.mockResolvedValue([]);
      mockIntelligenceRepo.createMoodCheckin.mockImplementation(async (data) => ({
        id: 'mc-3', ...data, microQuestionResponse: null, linkedReflectionId: null, respondedAt: null, createdAt: new Date(),
      }));

      const result = await useCase.execute({
        userId: TEST_USER_ID,
        mood: 'sad',
        emotionalIntensity: 5,
      });

      expect(result.patternConnection.connected).toBe(false);
      expect(result.patternConnection.message).toContain('3 times this week');
    });
  });

  describe('CalculateUserWellnessScoreUseCase', () => {
    let useCase: CalculateUserWellnessScoreUseCase;
    let mockProfileRepo: ReturnType<typeof createMockProfileRepository>;
    let mockEntryRepo: ReturnType<typeof createMockEntryRepository>;
    let mockAnalysisRepo: ReturnType<typeof createMockAnalysisRepository>;

    beforeEach(() => {
      mockProfileRepo = createMockProfileRepository();
      mockEntryRepo = createMockEntryRepository();
      mockAnalysisRepo = createMockAnalysisRepository();
      useCase = new CalculateUserWellnessScoreUseCase(
        mockProfileRepo as any,
        mockEntryRepo as any,
        mockAnalysisRepo as any
      );
    });

    it('should calculate wellness score successfully', async () => {
      mockEntryRepo.getEntriesByUser.mockResolvedValue([{ id: 'e1', userId: TEST_USER_ID }]);
      mockEntryRepo.getInsightsByUser.mockResolvedValue([{ id: 'i1', userId: TEST_USER_ID }]);
      mockAnalysisRepo.getUserPatterns.mockResolvedValue([]);
      mockAnalysisRepo.getProfileAnalytics.mockResolvedValue([]);

      const result = await useCase.execute({
        userId: TEST_USER_ID,
        includeTrends: true,
        includeInsights: true,
      });

      expect(result.userId).toBe(TEST_USER_ID);
      expect(result.overallWellnessScore).toBe(70);
      expect(result.wellnessGrade).toBe('B');
      expect(result.calculatedAt).toBeInstanceOf(Date);
    });

    it('should throw when userId is empty', async () => {
      await expect(useCase.execute({ userId: '' } as any)).rejects.toThrow();
    });

    it('should throw for invalid analysis depth', async () => {
      await expect(useCase.execute({
        userId: TEST_USER_ID,
        analysisDepth: 'invalid' as any,
      })).rejects.toThrow();
    });

    it('should throw for invalid date range', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 86400000);

      await expect(useCase.execute({
        userId: TEST_USER_ID,
        timeframe: { start: now, end: earlier },
      })).rejects.toThrow();
    });

    it('should throw for invalid dimensions', async () => {
      await expect(useCase.execute({
        userId: TEST_USER_ID,
        dimensions: ['invalid_dimension'],
      } as any)).rejects.toThrow();
    });
  });

  describe('ExplorePatternUseCase', () => {
    let useCase: ExplorePatternUseCase;
    let mockIntelligenceRepo: ReturnType<typeof createMockIntelligenceRepository>;

    beforeEach(() => {
      mockIntelligenceRepo = createMockIntelligenceRepository();
      useCase = new ExplorePatternUseCase(mockIntelligenceRepo);
    });

    it('should create a reaction and return follow-up action for resonates', async () => {
      const pattern = { id: 'pat-1', userId: TEST_USER_ID, patternType: 'emotional', patternName: 'Morning Clarity', description: null, frequency: 5, strength: 'moderate', trend: 'stable', firstObserved: new Date(), lastObserved: new Date(), relatedThemes: null, triggerFactors: null, isActive: true, evidenceEntryIds: null, explorationPrompt: null, metadata: null, createdAt: new Date(), updatedAt: new Date() };
      const reaction = { id: 'pr-1', userId: TEST_USER_ID, patternId: 'pat-1', reaction: 'resonates', explanation: null, followUpReflectionId: null, generatedInsightId: null, createdAt: new Date() };

      mockIntelligenceRepo.getPatternById.mockResolvedValue(pattern);
      mockIntelligenceRepo.createPatternReaction.mockResolvedValue(reaction);

      const result = await useCase.execute({
        patternId: 'pat-1',
        userId: TEST_USER_ID,
        reaction: 'resonates',
      });

      expect(result.reaction).toEqual(reaction);
      expect(result.followUpAction.type).toBe('insight_generated');
      expect(result.followUpAction.message).toContain('Morning Clarity');
    });

    it('should throw when pattern is not found', async () => {
      mockIntelligenceRepo.getPatternById.mockResolvedValue(null);

      await expect(useCase.execute({
        patternId: 'nonexistent',
        userId: TEST_USER_ID,
        reaction: 'resonates',
      })).rejects.toThrow();
    });

    it('should reduce pattern strength for not_me reaction', async () => {
      const pattern = { id: 'pat-1', userId: TEST_USER_ID, patternType: 'behavioral', patternName: 'Test Pattern', description: null, frequency: 3, strength: 'moderate', trend: 'stable', firstObserved: new Date(), lastObserved: new Date(), relatedThemes: null, triggerFactors: null, isActive: true, evidenceEntryIds: null, explorationPrompt: null, metadata: null, createdAt: new Date(), updatedAt: new Date() };
      const reaction = { id: 'pr-2', userId: TEST_USER_ID, patternId: 'pat-1', reaction: 'not_me', explanation: 'Does not fit', followUpReflectionId: null, generatedInsightId: null, createdAt: new Date() };

      mockIntelligenceRepo.getPatternById.mockResolvedValue(pattern);
      mockIntelligenceRepo.createPatternReaction.mockResolvedValue(reaction);
      mockIntelligenceRepo.updatePattern.mockResolvedValue({ ...pattern, strength: 'weak' });

      const result = await useCase.execute({
        patternId: 'pat-1',
        userId: TEST_USER_ID,
        reaction: 'not_me',
        explanation: 'Does not fit',
      });

      expect(result.followUpAction.type).toBe('pattern_refined');
      expect(mockIntelligenceRepo.updatePattern).toHaveBeenCalledWith('pat-1', { strength: 'weak' });
    });

    it('should set exploration prompt for curious reaction', async () => {
      const pattern = { id: 'pat-1', userId: TEST_USER_ID, patternType: 'emotional', patternName: 'Curiosity Loop', description: null, frequency: 2, strength: 'moderate', trend: 'stable', firstObserved: new Date(), lastObserved: new Date(), relatedThemes: null, triggerFactors: null, isActive: true, evidenceEntryIds: null, explorationPrompt: null, metadata: null, createdAt: new Date(), updatedAt: new Date() };
      const reaction = { id: 'pr-3', userId: TEST_USER_ID, patternId: 'pat-1', reaction: 'curious', explanation: null, followUpReflectionId: null, generatedInsightId: null, createdAt: new Date() };

      mockIntelligenceRepo.getPatternById.mockResolvedValue(pattern);
      mockIntelligenceRepo.createPatternReaction.mockResolvedValue(reaction);
      mockIntelligenceRepo.updatePattern.mockResolvedValue(pattern);

      await useCase.execute({
        patternId: 'pat-1',
        userId: TEST_USER_ID,
        reaction: 'curious',
      });

      expect(mockIntelligenceRepo.updatePattern).toHaveBeenCalledWith('pat-1', expect.objectContaining({
        explorationPrompt: expect.stringContaining('Curiosity Loop'),
      }));
    });
  });

  describe('GeneratePersonalNarrativeUseCase', () => {
    let useCase: GeneratePersonalNarrativeUseCase;
    let mockIntelligenceRepo: ReturnType<typeof createMockIntelligenceRepository>;

    beforeEach(() => {
      mockIntelligenceRepo = createMockIntelligenceRepository();
      useCase = new GeneratePersonalNarrativeUseCase(mockIntelligenceRepo);
    });

    it('should return existing narrative if recent enough', async () => {
      const recentNarrative = {
        id: 'narr-1', userId: TEST_USER_ID, periodStart: new Date(Date.now() - 3 * 86400000), periodEnd: new Date(), narrative: 'Recent narrative', dataPointsUsed: 10, breakthroughsReferenced: null, forwardPrompt: 'Forward prompt', userReflection: null, metadata: {}, createdAt: new Date(),
      };

      mockIntelligenceRepo.findLatestNarrative.mockResolvedValue(recentNarrative);

      const result = await useCase.execute({ userId: TEST_USER_ID });

      expect(result.isNew).toBe(false);
      expect(result.narrative).toEqual(recentNarrative);
    });

    it('should generate a new narrative when no recent one exists', async () => {
      const now = new Date();
      const reflections = [
        { id: 'r1', userId: TEST_USER_ID, challengeQuestion: 'Q1', userResponse: 'R1', followUpQuestions: null, isBreakthrough: false, engagementLevel: null, responseTime: null, submittedAt: null, createdAt: now, deletedAt: null },
      ];
      const moodCheckins = [
        { id: 'mc1', userId: TEST_USER_ID, mood: 'happy', emotionalIntensity: 7, content: null, triggerTag: null, microQuestion: null, microQuestionResponse: null, patternConnectionId: null, linkedReflectionId: null, respondedAt: null, createdAt: now },
      ];
      const patterns = [
        { id: 'p1', userId: TEST_USER_ID, patternType: 'emotional', patternName: 'Joy Pattern', description: null, frequency: 3, strength: 'strong', trend: 'increasing', firstObserved: now, lastObserved: now, relatedThemes: null, triggerFactors: null, isActive: true, evidenceEntryIds: null, explorationPrompt: null, metadata: null, createdAt: now, updatedAt: now },
      ];
      const createdNarrative = { id: 'narr-2', userId: TEST_USER_ID, periodStart: new Date(Date.now() - 7 * 86400000), periodEnd: now, narrative: 'New narrative', dataPointsUsed: 3, breakthroughsReferenced: null, forwardPrompt: 'Forward prompt', userReflection: null, metadata: {}, createdAt: now };

      mockIntelligenceRepo.findLatestNarrative.mockResolvedValue(null);
      mockIntelligenceRepo.findReflectionsByUserId.mockResolvedValue(reflections);
      mockIntelligenceRepo.findRecentMoodCheckins.mockResolvedValue(moodCheckins);
      mockIntelligenceRepo.getUserPatterns.mockResolvedValue(patterns);
      mockIntelligenceRepo.createPersonalNarrative.mockResolvedValue(createdNarrative);

      const result = await useCase.execute({ userId: TEST_USER_ID });

      expect(result.isNew).toBe(true);
      expect(result.narrative).toEqual(createdNarrative);
      expect(result.dataPointsSummary.total).toBeGreaterThan(0);
      expect(mockIntelligenceRepo.createPersonalNarrative).toHaveBeenCalled();
    });

    it('should respond to a narrative', async () => {
      const updatedNarrative = { id: 'narr-1', userId: TEST_USER_ID, periodStart: new Date(), periodEnd: new Date(), narrative: 'Text', dataPointsUsed: 5, breakthroughsReferenced: null, forwardPrompt: null, userReflection: 'My reflection', metadata: {}, createdAt: new Date() };
      mockIntelligenceRepo.updateNarrative.mockResolvedValue(updatedNarrative);

      const result = await useCase.respondToNarrative({
        narrativeId: 'narr-1',
        userId: TEST_USER_ID,
        userReflection: 'My reflection',
      });

      expect(result.userReflection).toBe('My reflection');
      expect(mockIntelligenceRepo.updateNarrative).toHaveBeenCalledWith('narr-1', { userReflection: 'My reflection' });
    });
  });

  describe('GetNarrativeSeedsUseCase', () => {
    let useCase: GetNarrativeSeedsUseCase;
    let mockIntelligenceRepo: ReturnType<typeof createMockIntelligenceRepository>;

    beforeEach(() => {
      mockIntelligenceRepo = createMockIntelligenceRepository();
      useCase = new GetNarrativeSeedsUseCase(mockIntelligenceRepo);
    });

    it('should extract narrative seeds from entries', async () => {
      const entries = [
        {
          id: 'e1', userId: TEST_USER_ID, content: 'Today I felt a deep sense of gratitude for my family and the journey we have been on together', entryType: 'journal', moodContext: 'grateful', sentiment: 'positive', emotionalIntensity: 8, tags: ['family', 'gratitude'], createdAt: new Date(),
        },
      ];
      mockIntelligenceRepo.findEntriesByUserId.mockResolvedValue(entries);

      const result = await useCase.execute({ userId: TEST_USER_ID });

      expect(result.userId).toBe(TEST_USER_ID);
      expect(result.entryCount).toBe(1);
      expect(result.seeds.length).toBeGreaterThan(0);
      expect(result.emotionalProfile.dominantMood).toBe('grateful');
      expect(result.emotionalProfile.dominantSentiment).toBe('positive');
    });

    it('should return empty seeds when no recent entries', async () => {
      const oldEntry = {
        id: 'e1', userId: TEST_USER_ID, content: 'Old entry', entryType: 'journal', moodContext: null, sentiment: null, emotionalIntensity: null, tags: null, createdAt: new Date('2020-01-01'),
      };
      mockIntelligenceRepo.findEntriesByUserId.mockResolvedValue([oldEntry]);

      const result = await useCase.execute({ userId: TEST_USER_ID, timeframeDays: 30 });

      expect(result.seeds).toEqual([]);
      expect(result.entryCount).toBe(0);
    });

    it('should respect maxSeeds parameter', async () => {
      const entries = [
        {
          id: 'e1', userId: TEST_USER_ID, content: 'gratitude family journey reflection love peace harmony strength growth wisdom connection inspiration creativity adventure discovery wonder beauty grace', entryType: 'journal', moodContext: 'happy', sentiment: 'positive', emotionalIntensity: 7, tags: ['reflection', 'growth', 'mindfulness'], createdAt: new Date(),
        },
      ];
      mockIntelligenceRepo.findEntriesByUserId.mockResolvedValue(entries);

      const result = await useCase.execute({ userId: TEST_USER_ID, maxSeeds: 3 });

      expect(result.seeds.length).toBeLessThanOrEqual(3);
    });
  });

  describe('UpdateUserGoalsFromInsightsUseCase', () => {
    let useCase: UpdateUserGoalsFromInsightsUseCase;
    let mockProfileRepo: ReturnType<typeof createMockProfileRepository>;
    let mockEntryRepo: ReturnType<typeof createMockEntryRepository>;
    let mockAnalysisRepo: ReturnType<typeof createMockAnalysisRepository>;

    beforeEach(() => {
      mockProfileRepo = createMockProfileRepository();
      mockEntryRepo = createMockEntryRepository();
      mockAnalysisRepo = createMockAnalysisRepository();
      useCase = new UpdateUserGoalsFromInsightsUseCase(
        mockProfileRepo as any,
        mockEntryRepo as any,
        mockAnalysisRepo as any
      );
    });

    it('should update goals from insights successfully', async () => {
      mockEntryRepo.getInsightsByUser.mockResolvedValue([]);
      mockAnalysisRepo.getUserPatterns.mockResolvedValue([]);
      mockEntryRepo.getEntriesByUser.mockResolvedValue([]);
      mockAnalysisRepo.getProfileAnalytics.mockResolvedValue([]);
      mockAnalysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

      const result = await useCase.execute({
        userId: TEST_USER_ID,
        goalGenerationMode: 'comprehensive',
      });

      expect(result.userId).toBe(TEST_USER_ID);
      expect(result.processedAt).toBeInstanceOf(Date);
      expect(result.summary).toBeDefined();
      expect(result.nextReviewDate).toBeInstanceOf(Date);
    });

    it('should throw when userId is empty', async () => {
      await expect(useCase.execute({
        userId: '',
        goalGenerationMode: 'comprehensive',
      })).rejects.toThrow();
    });

    it('should throw for invalid goal generation mode', async () => {
      await expect(useCase.execute({
        userId: TEST_USER_ID,
        goalGenerationMode: 'invalid' as any,
      })).rejects.toThrow();
    });

    it('should throw for invalid maxNewGoals', async () => {
      await expect(useCase.execute({
        userId: TEST_USER_ID,
        goalGenerationMode: 'comprehensive',
        maxNewGoals: 25,
      })).rejects.toThrow();
    });

    it('should throw for invalid confidence threshold', async () => {
      await expect(useCase.execute({
        userId: TEST_USER_ID,
        goalGenerationMode: 'focused',
        confidenceThreshold: 1.5,
      })).rejects.toThrow();
    });

    it('should throw for invalid date range', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 86400000);

      await expect(useCase.execute({
        userId: TEST_USER_ID,
        goalGenerationMode: 'maintenance',
        analysisTimeframe: { start: now, end: earlier },
      })).rejects.toThrow();
    });
  });
});
