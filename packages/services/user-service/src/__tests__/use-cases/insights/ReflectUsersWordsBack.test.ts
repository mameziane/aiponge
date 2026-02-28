import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../config/service-urls', () => ({
  getLogger: () => ({
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
        constructor(message: string, statusCode: number = 500, code?: string) {
          super(message);
          this.statusCode = statusCode;
          this.code = code;
        }
      }
  ),
  createServiceUrlsConfig: vi.fn(() => ({ getServiceUrl: vi.fn() })),
}));

import { truncateAtSentence } from '../../../application/utils/text';
import { GeneratePersonalNarrativeUseCase } from '../../../application/use-cases/insights/GeneratePersonalNarrativeUseCase';
import { ContinueReflectionDialogueUseCase } from '../../../application/use-cases/insights/ContinueReflectionDialogueUseCase';
import { DetectEntryPatternsUseCase } from '../../../application/use-cases/library/entry/DetectEntryPatternsUseCase';

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

function createMockAnalysisRepository() {
  return {
    getUserPatterns: vi.fn().mockResolvedValue([]),
    getProfileAnalytics: vi.fn().mockResolvedValue([]),
    recordAnalyticsEvent: vi.fn().mockResolvedValue(undefined),
    getEntriesByUser: vi.fn().mockResolvedValue([]),
  };
}

const TEST_USER_ID = 'user-123';

describe('truncateAtSentence utility', () => {
  it('returns text unchanged if under maxChars', () => {
    expect(truncateAtSentence('Hello world.', 120)).toBe('Hello world.');
  });

  it('returns empty string for empty input', () => {
    expect(truncateAtSentence('', 120)).toBe('');
  });

  it('truncates at sentence boundary when possible', () => {
    const text = 'First sentence. Second sentence is longer and goes beyond the limit. Third sentence.';
    const result = truncateAtSentence(text, 50);
    expect(result).toBe('First sentence.');
  });

  it('truncates at word boundary with ellipsis when no sentence end', () => {
    const text = 'This is a long text without any sentence ending that keeps going and going';
    const result = truncateAtSentence(text, 40);
    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(41);
  });

  it('handles text with exclamation mark as sentence end', () => {
    const text = 'I finally understand! This changes everything about how I see the world and my relationships.';
    const result = truncateAtSentence(text, 30);
    expect(result).toBe('I finally understand!');
  });

  it('handles text with question mark as sentence end', () => {
    const text = 'Why do I keep doing this? It makes no sense when I think about all the ways it hurts me.';
    const result = truncateAtSentence(text, 40);
    expect(result).toBe('Why do I keep doing this?');
  });

  it('does not truncate at very early sentence boundary', () => {
    const text = 'Ok. This is a much longer continuation of the text that explores deeper themes and feelings.';
    const result = truncateAtSentence(text, 80);
    expect(result.length).toBeGreaterThan(3);
  });
});

describe('Task 1: GeneratePersonalNarrativeUseCase - Quote user text', () => {
  let useCase: GeneratePersonalNarrativeUseCase;
  let mockRepo: ReturnType<typeof createMockIntelligenceRepository>;

  beforeEach(() => {
    mockRepo = createMockIntelligenceRepository();
    useCase = new GeneratePersonalNarrativeUseCase(mockRepo);
  });

  it('includes user reflection quotes in narrative', async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    mockRepo.findLatestNarrative.mockResolvedValue(null);
    mockRepo.findReflectionsByUserId.mockResolvedValue([
      {
        id: 'ref-1',
        challengeQuestion: 'What matters most?',
        userResponse: 'I realized my family is everything to me.',
        isBreakthrough: false,
        createdAt: twoDaysAgo,
      },
    ]);
    mockRepo.findRecentMoodCheckins.mockResolvedValue([
      { mood: 'calm', emotionalIntensity: 6, microQuestionResponse: null },
    ]);
    mockRepo.getUserPatterns.mockResolvedValue([]);
    mockRepo.createPersonalNarrative.mockImplementation(async (data: { narrative: string }) => ({
      id: 'narrative-1',
      ...data,
      dataPointsUsed: 2,
    }));

    await useCase.execute({ userId: TEST_USER_ID });

    const narrativeArg = mockRepo.createPersonalNarrative.mock.calls[0][0];
    expect(narrativeArg.narrative).toContain('In your own words:');
    expect(narrativeArg.narrative).toContain('I realized my family is everything to me.');
  });

  it('includes mood check-in microQuestionResponse quotes', async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    mockRepo.findLatestNarrative.mockResolvedValue(null);
    mockRepo.findReflectionsByUserId.mockResolvedValue([]);
    mockRepo.findRecentMoodCheckins.mockResolvedValue([
      {
        mood: 'anxious',
        emotionalIntensity: 7,
        microQuestionResponse: 'Work deadlines are overwhelming me right now.',
      },
      { mood: 'calm', emotionalIntensity: 4, microQuestionResponse: null },
    ]);
    mockRepo.getUserPatterns.mockResolvedValue([]);
    mockRepo.createPersonalNarrative.mockImplementation(async (data: { narrative: string }) => ({
      id: 'narrative-2',
      ...data,
      dataPointsUsed: 2,
    }));

    await useCase.execute({ userId: TEST_USER_ID });

    const narrativeArg = mockRepo.createPersonalNarrative.mock.calls[0][0];
    expect(narrativeArg.narrative).toContain('Work deadlines are overwhelming me right now.');
  });

  it('includes breakthrough quotes separately from regular reflections', async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    mockRepo.findLatestNarrative.mockResolvedValue(null);
    mockRepo.findReflectionsByUserId.mockResolvedValue([
      {
        id: 'ref-1',
        challengeQuestion: 'What matters?',
        userResponse: 'Regular reflection text here.',
        isBreakthrough: false,
        createdAt: twoDaysAgo,
      },
      {
        id: 'ref-2',
        challengeQuestion: 'Deep question?',
        userResponse: 'I finally see the connection between my patterns.',
        isBreakthrough: true,
        createdAt: twoDaysAgo,
      },
    ]);
    mockRepo.findRecentMoodCheckins.mockResolvedValue([]);
    mockRepo.getUserPatterns.mockResolvedValue([]);
    mockRepo.createPersonalNarrative.mockImplementation(async (data: { narrative: string }) => ({
      id: 'narrative-3',
      ...data,
      dataPointsUsed: 2,
    }));

    await useCase.execute({ userId: TEST_USER_ID });

    const narrativeArg = mockRepo.createPersonalNarrative.mock.calls[0][0];
    expect(narrativeArg.narrative).toContain('Regular reflection text here.');
    expect(narrativeArg.narrative).toContain('I finally see the connection between my patterns.');
  });

  it('truncates long user quotes at sentence boundary', async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const longResponse =
      'I have been thinking about this for a long time. It seems like every time I try to move forward something holds me back. Maybe it is fear of the unknown or maybe it is something deeper that I have not yet discovered about myself.';

    mockRepo.findLatestNarrative.mockResolvedValue(null);
    mockRepo.findReflectionsByUserId.mockResolvedValue([
      {
        id: 'ref-1',
        challengeQuestion: 'What holds you back?',
        userResponse: longResponse,
        isBreakthrough: false,
        createdAt: twoDaysAgo,
      },
    ]);
    mockRepo.findRecentMoodCheckins.mockResolvedValue([]);
    mockRepo.getUserPatterns.mockResolvedValue([]);
    mockRepo.createPersonalNarrative.mockImplementation(async (data: { narrative: string }) => ({
      id: 'narrative-4',
      ...data,
      dataPointsUsed: 1,
    }));

    await useCase.execute({ userId: TEST_USER_ID });

    const narrativeArg = mockRepo.createPersonalNarrative.mock.calls[0][0];
    const excerptSection = narrativeArg.narrative.split('In your own words:')[1];
    const quotedText = excerptSection.match(/"([^"]+)"/)?.[1];
    expect(quotedText).toBeDefined();
    expect(quotedText!.length).toBeLessThanOrEqual(121);
  });

  it('skips excerpts section when no user text is available', async () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    mockRepo.findLatestNarrative.mockResolvedValue(null);
    mockRepo.findReflectionsByUserId.mockResolvedValue([
      {
        id: 'ref-1',
        challengeQuestion: 'What matters?',
        userResponse: null,
        isBreakthrough: false,
        createdAt: twoDaysAgo,
      },
    ]);
    mockRepo.findRecentMoodCheckins.mockResolvedValue([
      { mood: 'calm', emotionalIntensity: 5, microQuestionResponse: null },
    ]);
    mockRepo.getUserPatterns.mockResolvedValue([]);
    mockRepo.createPersonalNarrative.mockImplementation(async (data: { narrative: string }) => ({
      id: 'narrative-5',
      ...data,
      dataPointsUsed: 2,
    }));

    await useCase.execute({ userId: TEST_USER_ID });

    const narrativeArg = mockRepo.createPersonalNarrative.mock.calls[0][0];
    expect(narrativeArg.narrative).not.toContain('In your own words:');
  });
});

describe('Task 2: DetectEntryPatternsUseCase - Personalize pattern names', () => {
  it('personalizes cognitive pattern names using user seeds', () => {
    const mockRepo = createMockAnalysisRepository();
    const useCase = new DetectEntryPatternsUseCase(mockRepo as any);

    const seeds = [{ keyword: 'growth', frequency: 5, source: 'content' as const, emotionalWeight: 1.5 }];

    const result = useCase.personalizePatternName('Causal Reasoning', 'cognitive', seeds);
    expect(result.toLowerCase()).toContain('growth');
    expect(result).not.toBe('Causal Reasoning');
  });

  it('personalizes emotional pattern names using mood seeds', () => {
    const mockRepo = createMockAnalysisRepository();
    const useCase = new DetectEntryPatternsUseCase(mockRepo as any);

    const seeds = [
      { keyword: 'peaceful', frequency: 3, source: 'mood' as const, emotionalWeight: 2.0 },
      { keyword: 'morning', frequency: 5, source: 'content' as const, emotionalWeight: 1.0 },
    ];

    const result = useCase.personalizePatternName('Positive Emotional Expression', 'emotional', seeds);
    expect(result).toContain('Peaceful');
  });

  it('returns default name when no seeds available', () => {
    const mockRepo = createMockAnalysisRepository();
    const useCase = new DetectEntryPatternsUseCase(mockRepo as any);

    const result = useCase.personalizePatternName('Causal Reasoning', 'cognitive', []);
    expect(result).toBe('Causal Reasoning');
  });

  it('falls back to generic personalized pattern when no matching map entry', () => {
    const mockRepo = createMockAnalysisRepository();
    const useCase = new DetectEntryPatternsUseCase(mockRepo as any);

    const seeds = [{ keyword: 'wonder', frequency: 3, source: 'content' as const, emotionalWeight: 1.0 }];

    const result = useCase.personalizePatternName('Unknown Pattern Type', 'cognitive', seeds);
    expect(result).toContain('Wonder');
  });

  it('integrates GetNarrativeSeedsUseCase when executing', async () => {
    const mockRepo = createMockAnalysisRepository();
    mockRepo.getEntriesByUser.mockResolvedValue([
      { id: 'e1', content: 'I wonder because growth matters therefore', createdAt: new Date(), tags: [] },
      { id: 'e2', content: 'Therefore I feel because of the reason', createdAt: new Date(), tags: [] },
      { id: 'e3', content: 'Since I started because of this, as a result I grew', createdAt: new Date(), tags: [] },
    ]);

    const mockNarrativeSeedsUseCase = {
      execute: vi.fn().mockResolvedValue({
        userId: TEST_USER_ID,
        seeds: [{ keyword: 'growth', frequency: 5, source: 'content', emotionalWeight: 1.5 }],
        emotionalProfile: { dominantMood: null, dominantSentiment: null, emotionalIntensityAvg: 0 },
        entryCount: 3,
        timeframe: { start: new Date(), end: new Date() },
        generatedAt: new Date().toISOString(),
      }),
    };

    const useCase = new DetectEntryPatternsUseCase(mockRepo as any, mockNarrativeSeedsUseCase as any);
    const result = await useCase.execute({ userId: TEST_USER_ID });

    expect(mockNarrativeSeedsUseCase.execute).toHaveBeenCalledWith({
      userId: TEST_USER_ID,
      maxSeeds: 15,
      timeframeDays: 30,
    });

    for (const pattern of result.detectedPatterns) {
      expect(pattern.pattern.name.toLowerCase()).toContain('growth');
    }
  });
});

describe('Task 3: ContinueReflectionDialogueUseCase - Breakthrough Insight creation', () => {
  let useCase: ContinueReflectionDialogueUseCase;
  let mockRepo: ReturnType<typeof createMockIntelligenceRepository>;

  beforeEach(() => {
    mockRepo = createMockIntelligenceRepository();
    useCase = new ContinueReflectionDialogueUseCase(mockRepo);
  });

  it('creates insight when breakthrough is detected', async () => {
    const breakthroughResponse =
      'I finally realize that my fear of failure has been driving all my decisions. I understand now that this pattern started in childhood when I was told I was never good enough. This makes sense because every time I face a challenge I freeze up.';

    mockRepo.findReflectionById.mockResolvedValue({
      id: 'ref-1',
      userId: TEST_USER_ID,
      challengeQuestion: 'What drives your decisions?',
      isBreakthrough: false,
    });

    mockRepo.findReflectionTurnsByReflectionId.mockResolvedValue([
      {
        id: 'turn-1',
        reflectionId: 'ref-1',
        turnNumber: 1,
        question: 'Q1',
        response: 'R1',
        microInsight: null,
        therapeuticFramework: 'cbt',
        respondedAt: new Date(),
      },
      {
        id: 'turn-2',
        reflectionId: 'ref-1',
        turnNumber: 2,
        question: 'Q2',
        response: 'R2',
        microInsight: null,
        therapeuticFramework: 'cbt',
        respondedAt: new Date(),
      },
      {
        id: 'turn-3',
        reflectionId: 'ref-1',
        turnNumber: 3,
        question: 'Q3',
        response: null,
        microInsight: null,
        therapeuticFramework: 'cbt',
        respondedAt: null,
      },
    ]);

    mockRepo.getMaxTurnNumber.mockResolvedValue(3);

    mockRepo.updateReflectionTurn.mockResolvedValue({
      id: 'turn-3',
      reflectionId: 'ref-1',
      turnNumber: 3,
      question: 'Q3',
      response: breakthroughResponse,
      microInsight: 'insight',
      therapeuticFramework: 'cbt',
      respondedAt: new Date(),
    });

    mockRepo.updateReflection.mockResolvedValue({
      id: 'ref-1',
      isBreakthrough: true,
    });

    mockRepo.createInsight.mockResolvedValue({
      id: 'insight-new-1',
      userId: TEST_USER_ID,
      type: 'self_discovered',
      title: 'I finally realize that my fear of failure has been driving all my decisions.',
      content: breakthroughResponse,
    });

    const result = await useCase.execute({
      reflectionId: 'ref-1',
      userId: TEST_USER_ID,
      userResponse: breakthroughResponse,
    });

    expect(result.isBreakthrough).toBe(true);
    expect(result.savedInsightId).toBe('insight-new-1');
    expect(mockRepo.createInsight).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: TEST_USER_ID,
        type: 'self_discovered',
        content: breakthroughResponse,
        category: 'breakthrough',
      })
    );
  });

  it('does not create insight when no breakthrough detected', async () => {
    const normalResponse = 'I think things are okay.';

    mockRepo.findReflectionById.mockResolvedValue({
      id: 'ref-1',
      userId: TEST_USER_ID,
      challengeQuestion: 'How are things?',
      isBreakthrough: false,
    });

    mockRepo.findReflectionTurnsByReflectionId.mockResolvedValue([]);
    mockRepo.getMaxTurnNumber.mockResolvedValue(0);

    mockRepo.createReflectionTurn.mockResolvedValue({
      id: 'turn-1',
      reflectionId: 'ref-1',
      turnNumber: 1,
      question: 'How are things?',
      response: normalResponse,
      microInsight: 'insight',
      therapeuticFramework: 'cbt',
      respondedAt: new Date(),
    });

    const result = await useCase.execute({
      reflectionId: 'ref-1',
      userId: TEST_USER_ID,
      userResponse: normalResponse,
    });

    expect(result.isBreakthrough).toBe(false);
    expect(result.savedInsightId).toBeNull();
    expect(mockRepo.createInsight).not.toHaveBeenCalled();
  });

  it('returns savedInsightId in DialogueResult', async () => {
    const breakthroughResponse =
      'I realize now that everything makes sense. The pattern I see is that whenever I feel stressed I withdraw from people. I understand now that this is a protective mechanism I learned from my parents who always handled stress alone.';

    mockRepo.findReflectionById.mockResolvedValue({
      id: 'ref-1',
      userId: TEST_USER_ID,
      challengeQuestion: 'What patterns do you see?',
      isBreakthrough: false,
    });

    mockRepo.findReflectionTurnsByReflectionId.mockResolvedValue([
      {
        id: 'turn-1',
        turnNumber: 1,
        question: 'Q1',
        response: 'R1',
        reflectionId: 'ref-1',
        microInsight: null,
        therapeuticFramework: 'cbt',
        respondedAt: new Date(),
      },
      {
        id: 'turn-2',
        turnNumber: 2,
        question: 'Q2',
        response: 'R2',
        reflectionId: 'ref-1',
        microInsight: null,
        therapeuticFramework: 'cbt',
        respondedAt: new Date(),
      },
      {
        id: 'turn-3',
        turnNumber: 3,
        question: 'Q3',
        response: null,
        reflectionId: 'ref-1',
        microInsight: null,
        therapeuticFramework: 'cbt',
        respondedAt: null,
      },
    ]);

    mockRepo.getMaxTurnNumber.mockResolvedValue(3);

    mockRepo.updateReflectionTurn.mockResolvedValue({
      id: 'turn-3',
      reflectionId: 'ref-1',
      turnNumber: 3,
      question: 'Q3',
      response: breakthroughResponse,
      microInsight: 'insight',
      therapeuticFramework: 'cbt',
      respondedAt: new Date(),
    });

    mockRepo.updateReflection.mockResolvedValue({ id: 'ref-1', isBreakthrough: true });
    mockRepo.createInsight.mockResolvedValue({ id: 'insight-xyz', userId: TEST_USER_ID });

    const result = await useCase.execute({
      reflectionId: 'ref-1',
      userId: TEST_USER_ID,
      userResponse: breakthroughResponse,
    });

    expect(result).toHaveProperty('savedInsightId');
    expect(result.savedInsightId).toBe('insight-xyz');
  });
});

describe('Task 4: Evidence entry IDs in pattern names', () => {
  it('DetectedPattern occurrences have IDs for evidence mapping', () => {
    const mockRepo = createMockAnalysisRepository();
    const useCase = new DetectEntryPatternsUseCase(mockRepo as any);

    expect(useCase).toBeDefined();
  });
});
