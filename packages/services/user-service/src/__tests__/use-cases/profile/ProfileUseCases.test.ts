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
  PROFILE_VISIBILITY: { PUBLIC: 'public', PRIVATE: 'private', FRIENDS_ONLY: 'friends_only' },
  USER_STATUS: { ACTIVE: 'active', INACTIVE: 'inactive', SUSPENDED: 'suspended' },
  CONTENT_VISIBILITY: { PUBLIC: 'public', PRIVATE: 'private' },
}));

vi.mock('../../../application/services/ProfileNameUpdateHelper', () => ({
  ProfileNameUpdateHelper: {
    updateAndSync: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../../domains/profile/entities/UserProfile', () => {
  const mockProfile = {
    userId: 'user-123',
    displayName: 'Test User',
    bio: '',
    personalInfo: {},
    socialLinks: {},
    contactPreferences: {},
    visibilitySettings: {},
    interests: [],
    tags: [],
    metadata: {},
  };
  return {
    UserProfile: {},
    UserProfileHelper: {
      create: vi.fn(() => ({ ...mockProfile })),
      updateSocialLinks: vi.fn((profile: unknown) => profile),
      updateContactPreferences: vi.fn((profile: unknown) => profile),
      updatePrivacySettings: vi.fn((profile: unknown) => profile),
      addInterest: vi.fn((profile: unknown) => profile),
      addTag: vi.fn((profile: unknown) => profile),
      calculateCompletionScore: vi.fn(() => 85),
      calculateIsComplete: vi.fn(() => true),
      updateActivity: vi.fn((profile: unknown) => profile),
    },
  };
});

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
    getEntriesByUser: vi.fn().mockResolvedValue([]),
  };
}

function createMockPersonaRepository() {
  return {
    upsertLatestPersona: vi.fn(),
    getLatestPersona: vi.fn(),
    getPersonaHistory: vi.fn(),
    deletePersona: vi.fn(),
    deactivateAllPersonas: vi.fn(),
  };
}

function createMockPersonalityAnalyzer() {
  return {
    analyze: vi.fn().mockResolvedValue({
      primaryTraits: [{ trait: 'openness', score: 0.8, description: 'Open', confidence: 0.9 }],
      secondaryTraits: [],
      personalityType: 'Creative Explorer',
      cognitiveStyle: 'Analytical',
      emotionalProfile: { dominantEmotions: ['joy'], emotionalRange: 0.7, emotionalStability: 0.8, resilience: 0.75 },
    }),
  };
}

function createMockBehaviorAnalyzer() {
  return {
    analyze: vi.fn().mockResolvedValue({
      patterns: [{ pattern: 'morning routine', frequency: 0.8, strength: 0.7, trend: 'stable' }],
      preferences: {
        communicationStyle: 'Direct',
        learningStyle: 'Visual',
        decisionMaking: 'Analytical',
        conflictResolution: 'Collaborative',
      },
      motivators: ['growth'],
      stressors: ['deadlines'],
    }),
  };
}

function createMockCognitiveAnalyzer() {
  return {
    analyze: vi.fn().mockResolvedValue({
      thinkingPatterns: ['systematic'],
      problemSolvingStyle: 'Analytical',
      creativity: 0.7,
      analyticalThinking: 0.8,
      intuitiveThinkers: 0.6,
    }),
  };
}

function createMockSocialAnalyzer() {
  return {
    analyze: vi.fn().mockResolvedValue({
      relationshipStyle: 'Collaborative',
      socialNeeds: ['connection'],
      communicationPreferences: ['written'],
    }),
  };
}

function createMockGrowthAnalyzer() {
  return {
    analyze: vi.fn().mockResolvedValue({
      developmentAreas: ['leadership'],
      strengths: ['empathy'],
      potentialGrowthPaths: ['management'],
    }),
  };
}

function createMockBackupRepository() {
  return {
    createBackup: vi.fn().mockResolvedValue(undefined),
    getBackup: vi.fn(),
    deleteBackup: vi.fn().mockResolvedValue(true),
    cleanupExpiredBackups: vi.fn().mockResolvedValue(0),
  };
}

const TEST_USER_ID = 'user-123';
const TEST_DATE = new Date('2025-06-01');
const TEST_DATE_OLD = new Date('2025-01-01');

function createBasicProfile(overrides = {}) {
  return {
    userId: TEST_USER_ID,
    totalInsights: 10,
    totalReflections: 5,
    totalEntries: 20,
    lastUpdated: TEST_DATE,
    createdAt: TEST_DATE_OLD,
    ...overrides,
  };
}

function createEntryRecords(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `entry-${i}`,
    userId: TEST_USER_ID,
    chapterId: null,
    chapterSortOrder: null,
    content: `Entry content number ${i} with some reasonable length text for testing purposes`,
    type: 'reflection',
    moodContext: 'positive',
    triggerSource: null,
    sentiment: 'positive',
    emotionalIntensity: 0.7,
    processingStatus: 'completed',
    tags: ['growth'],
    metadata: {},
    createdAt: new Date(TEST_DATE_OLD.getTime() + i * 86400000),
    updatedAt: new Date(TEST_DATE_OLD.getTime() + i * 86400000),
  }));
}

function createInsightRecords(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `insight-${i}`,
    userId: TEST_USER_ID,
    entryId: `entry-${i}`,
    type: 'pattern',
    title: `Insight ${i}`,
    content: `Insight content ${i}`,
    confidence: '0.85',
    category: 'cognitive',
    themes: ['growth'],
    actionable: true,
    priority: 5,
    aiProvider: 'openai',
    aiModel: 'gpt-4',
    generatedAt: new Date(TEST_DATE_OLD.getTime() + i * 86400000),
    validatedAt: null,
    validatedBy: null,
    metadata: {},
    createdAt: new Date(TEST_DATE_OLD.getTime() + i * 86400000),
  }));
}

// ==================== GetUserProfileUseCase ====================
describe('GetUserProfileUseCase', () => {
  let useCase: InstanceType<typeof import('../../../application/use-cases/profile/GetUserProfileUseCase').GetUserProfileUseCase>;
  let profileRepo: ReturnType<typeof createMockProfileRepository>;
  let entryRepo: ReturnType<typeof createMockEntryRepository>;

  beforeEach(async () => {
    vi.clearAllMocks();
    profileRepo = createMockProfileRepository();
    entryRepo = createMockEntryRepository();
    const { GetUserProfileUseCase } = await import('../../../application/use-cases/profile/GetUserProfileUseCase');
    useCase = new GetUserProfileUseCase(profileRepo as any, entryRepo as any);
  });

  it('should return full user profile when profile exists', async () => {
    const basicProfile = createBasicProfile();
    profileRepo.getProfile.mockResolvedValue(basicProfile);
    profileRepo.getProfileSummary.mockResolvedValue({
      userId: TEST_USER_ID,
      topThemes: [{ theme: 'growth', count: 5 }],
      growthMetrics: { totalInsights: 10, totalReflections: 5, totalEntries: 20 },
    });
    profileRepo.getUserBasicInfo.mockResolvedValue({ profile: { name: 'John Doe' } });

    const result = await useCase.execute({ userId: TEST_USER_ID });

    expect(result).not.toBeNull();
    expect(result!.userId).toBe(TEST_USER_ID);
    expect(result!.basicProfile.displayName).toBe('John Doe');
    expect(result!.analytics.totalInsights).toBe(10);
    expect(result!.analytics.dominantThemes).toContain('growth');
  });

  it('should return null when profile not found', async () => {
    profileRepo.getProfile.mockResolvedValue(null);

    const result = await useCase.execute({ userId: TEST_USER_ID });

    expect(result).toBeNull();
  });

  it('should use fallback display name when user info has no name', async () => {
    profileRepo.getProfile.mockResolvedValue(createBasicProfile());
    profileRepo.getProfileSummary.mockResolvedValue(null);
    profileRepo.getUserBasicInfo.mockResolvedValue(null);

    const result = await useCase.execute({ userId: TEST_USER_ID });

    expect(result).not.toBeNull();
    expect(result!.basicProfile.displayName).toContain('User');
  });

  it('should return basic profile via getBasicProfile method', async () => {
    const basicProfile = createBasicProfile();
    profileRepo.getProfile.mockResolvedValue(basicProfile);

    const result = await useCase.getBasicProfile(TEST_USER_ID);

    expect(result).not.toBeNull();
    expect(result!.userId).toBe(TEST_USER_ID);
    expect(result!.totalInsights).toBe(10);
  });

  it('should throw ProfileError on unexpected error', async () => {
    profileRepo.getProfile.mockRejectedValue(new Error('DB connection failed'));

    await expect(useCase.execute({ userId: TEST_USER_ID })).rejects.toThrow('Failed to retrieve user profile');
  });
});

// ==================== UpdateProfileUseCase ====================
describe('UpdateProfileUseCase', () => {
  let useCase: InstanceType<typeof import('../../../application/use-cases/profile/UpdateProfileUseCase').UpdateProfileUseCase>;
  let profileRepo: ReturnType<typeof createMockProfileRepository>;

  beforeEach(async () => {
    vi.clearAllMocks();
    profileRepo = createMockProfileRepository();
    const { UpdateProfileUseCase } = await import('../../../application/use-cases/profile/UpdateProfileUseCase');
    useCase = new UpdateProfileUseCase(profileRepo as any);
  });

  it('should update existing profile successfully', async () => {
    const existingProfile = { userId: TEST_USER_ID, totalInsights: 0, totalReflections: 0, totalEntries: 0 };
    profileRepo.findProfileByUserId.mockResolvedValue(existingProfile);
    profileRepo.updateProfile.mockResolvedValue(undefined);
    profileRepo.findProfileByUserId.mockResolvedValueOnce(existingProfile).mockResolvedValueOnce({ ...existingProfile, displayName: 'Updated' });

    const result = await useCase.execute({ userId: TEST_USER_ID, displayName: 'Updated' });

    expect(result.success).toBe(true);
    expect(profileRepo.updateProfile).toHaveBeenCalledWith(TEST_USER_ID, expect.objectContaining({ userId: TEST_USER_ID }));
  });

  it('should create profile when not found then update', async () => {
    profileRepo.findProfileByUserId.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: TEST_USER_ID });
    profileRepo.createProfile.mockResolvedValue({ userId: TEST_USER_ID });
    profileRepo.updateProfile.mockResolvedValue(undefined);

    const result = await useCase.execute({ userId: TEST_USER_ID, bio: 'Hello' });

    expect(result.success).toBe(true);
    expect(profileRepo.createProfile).toHaveBeenCalled();
  });

  it('should return error when userId is empty', async () => {
    const result = await useCase.execute({ userId: '' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('User ID is required');
  });

  it('should handle repository errors gracefully', async () => {
    profileRepo.findProfileByUserId.mockRejectedValue(new Error('DB error'));

    const result = await useCase.execute({ userId: TEST_USER_ID });

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB error');
  });

  it('should delegate to execute via updatePreferences', async () => {
    profileRepo.findProfileByUserId.mockResolvedValue({ userId: TEST_USER_ID });
    profileRepo.updateProfile.mockResolvedValue(undefined);

    const result = await useCase.updatePreferences(TEST_USER_ID, { theme: 'dark' });
    expect(result.success).toBe(true);
  });
});

// ==================== UpdateUserProfileUseCase ====================
describe('UpdateUserProfileUseCase', () => {
  let useCase: InstanceType<typeof import('../../../application/use-cases/profile/UpdateUserProfileUseCase').UpdateUserProfileUseCase>;
  let profileRepo: ReturnType<typeof createMockProfileRepository>;

  beforeEach(async () => {
    vi.clearAllMocks();
    profileRepo = createMockProfileRepository();
    const { UpdateUserProfileUseCase } = await import('../../../application/use-cases/profile/UpdateUserProfileUseCase');
    useCase = new UpdateUserProfileUseCase(profileRepo as any);
  });

  it('should update user profile with display name and bio', async () => {
    profileRepo.getProfile.mockResolvedValue(createBasicProfile());

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      displayName: 'New Name',
      bio: 'New bio',
    });

    expect(result.success).toBe(true);
    expect(result.completionScore).toBeDefined();
  });

  it('should create profile if it does not exist', async () => {
    profileRepo.getProfile.mockResolvedValue(null);
    profileRepo.createProfile.mockResolvedValue(createBasicProfile());

    const result = await useCase.execute({ userId: TEST_USER_ID, displayName: 'New User' });

    expect(result.success).toBe(true);
    expect(profileRepo.createProfile).toHaveBeenCalled();
  });

  it('should handle social links update', async () => {
    profileRepo.getProfile.mockResolvedValue(createBasicProfile());

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      socialLinks: { website: 'https://example.com', twitter: 'test' },
    });

    expect(result.success).toBe(true);
  });

  it('should return error on repository failure', async () => {
    profileRepo.getProfile.mockRejectedValue(new Error('Connection lost'));

    const result = await useCase.execute({ userId: TEST_USER_ID });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Connection lost');
  });

  it('should handle verifyProfile returning not available', async () => {
    const result = await useCase.verifyProfile(TEST_USER_ID, 'email');

    expect(result.success).toBe(false);
    expect(result.error).toContain('not yet available');
  });
});

// ==================== GetUserProfileSummaryUseCase ====================
describe('GetUserProfileSummaryUseCase', () => {
  let useCase: InstanceType<typeof import('../../../application/use-cases/profile/GetUserProfileSummaryUseCase').GetUserProfileSummaryUseCase>;
  let profileRepo: ReturnType<typeof createMockProfileRepository>;
  let entryRepo: ReturnType<typeof createMockEntryRepository>;
  let analysisRepo: ReturnType<typeof createMockAnalysisRepository>;

  beforeEach(async () => {
    vi.clearAllMocks();
    profileRepo = createMockProfileRepository();
    entryRepo = createMockEntryRepository();
    analysisRepo = createMockAnalysisRepository();
    const { GetUserProfileSummaryUseCase } = await import('../../../application/use-cases/profile/GetUserProfileSummaryUseCase');
    useCase = new GetUserProfileSummaryUseCase(profileRepo as any, entryRepo as any, analysisRepo as any);
  });

  it('should generate a basic profile summary', async () => {
    profileRepo.getProfile.mockResolvedValue(createBasicProfile());
    entryRepo.getEntriesByUser.mockResolvedValue(createEntryRecords(10));
    entryRepo.getInsightsByUser.mockResolvedValue(createInsightRecords(5));
    analysisRepo.getUserPatterns.mockResolvedValue([]);
    analysisRepo.getProfileAnalytics.mockResolvedValue([]);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      scope: {
        includeBasicMetrics: true,
        includeEntryAnalysis: true,
        includeInsightSummary: true,
        summaryDepth: 'standard',
      },
    });

    expect(result.summary).toBeDefined();
    expect(result.summary.userId).toBe(TEST_USER_ID);
    expect(result.summary.entryAnalysis).toBeDefined();
    expect(result.summary.insightSummary).toBeDefined();
    expect(result.metadata.dataPointsAnalyzed).toBeGreaterThan(0);
  });

  it('should throw on empty userId', async () => {
    await expect(
      useCase.execute({ userId: '', scope: { summaryDepth: 'standard' } })
    ).rejects.toThrow();
  });

  it('should throw on invalid summaryDepth', async () => {
    await expect(
      useCase.execute({ userId: TEST_USER_ID, scope: { summaryDepth: 'invalid' as any } })
    ).rejects.toThrow();
  });

  it('should throw on invalid date range', async () => {
    await expect(
      useCase.execute({
        userId: TEST_USER_ID,
        scope: {
          timeframe: { start: new Date('2025-12-01'), end: new Date('2025-01-01') },
        },
      })
    ).rejects.toThrow();
  });

  it('should include recommendations when requested', async () => {
    profileRepo.getProfile.mockResolvedValue(createBasicProfile());

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      scope: { includeBasicMetrics: true },
      includeRecommendations: true,
    });

    expect(result.summary.recommendations).toBeDefined();
  });
});

// ==================== GeneratePersonalityProfileUseCase ====================
describe('GeneratePersonalityProfileUseCase', () => {
  let useCase: InstanceType<typeof import('../../../application/use-cases/profile/GeneratePersonalityProfileUseCase').GeneratePersonalityProfileUseCase>;
  let analysisRepo: ReturnType<typeof createMockAnalysisRepository>;

  beforeEach(async () => {
    vi.clearAllMocks();
    analysisRepo = createMockAnalysisRepository();
    const { GeneratePersonalityProfileUseCase } = await import('../../../application/use-cases/profile/GeneratePersonalityProfileUseCase');
    useCase = new GeneratePersonalityProfileUseCase(analysisRepo as any);
  });

  it('should generate personality profile with provided entries', async () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `entry-${i}`,
      content: `Entry content ${i}`,
      createdAt: new Date(),
      type: 'reflection',
    }));
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      entryHistory: entries,
      analysisDepth: 'detailed',
      includePatternAnalysis: true,
    });

    expect(result.userId).toBe(TEST_USER_ID);
    expect(result.personalityAssessment.traits.length).toBeGreaterThan(0);
    expect(result.personalityInsights.strengths.length).toBeGreaterThan(0);
    expect(result.detectedPatterns.length).toBeGreaterThan(0);
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('should throw on empty userId', async () => {
    await expect(
      useCase.execute({ userId: '', analysisDepth: 'basic' })
    ).rejects.toThrow();
  });

  it('should throw on invalid analysis depth', async () => {
    await expect(
      useCase.execute({ userId: TEST_USER_ID, analysisDepth: 'extreme' as any })
    ).rejects.toThrow();
  });

  it('should throw when insufficient entries', async () => {
    const entries = [{ id: '1', content: 'short', createdAt: new Date() }];

    await expect(
      useCase.execute({ userId: TEST_USER_ID, entryHistory: entries, analysisDepth: 'basic' })
    ).rejects.toThrow('Insufficient data');
  });

  it('should fetch entries from repository when not provided', async () => {
    analysisRepo.getEntriesByUser.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: `entry-${i}`,
        content: `Entry content ${i}`,
        createdAt: new Date(),
        type: 'reflection',
      }))
    );
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      analysisDepth: 'basic',
    });

    expect(result.userId).toBe(TEST_USER_ID);
    expect(analysisRepo.getEntriesByUser).toHaveBeenCalledWith(TEST_USER_ID, expect.any(Object));
  });
});

// ==================== GenerateProfileHighlightsUseCase ====================
describe('GenerateProfileHighlightsUseCase', () => {
  let useCase: InstanceType<typeof import('../../../application/use-cases/profile/GenerateProfileHighlightsUseCase').GenerateProfileHighlightsUseCase>;
  let profileRepo: ReturnType<typeof createMockProfileRepository>;
  let entryRepo: ReturnType<typeof createMockEntryRepository>;
  let analysisRepo: ReturnType<typeof createMockAnalysisRepository>;

  beforeEach(async () => {
    vi.clearAllMocks();
    profileRepo = createMockProfileRepository();
    entryRepo = createMockEntryRepository();
    analysisRepo = createMockAnalysisRepository();
    const { GenerateProfileHighlightsUseCase } = await import('../../../application/use-cases/profile/GenerateProfileHighlightsUseCase');
    useCase = new GenerateProfileHighlightsUseCase(profileRepo as any, entryRepo as any, analysisRepo as any);
  });

  it('should generate highlights for a user with entries', async () => {
    profileRepo.getProfile.mockResolvedValue(createBasicProfile());
    entryRepo.getEntriesByUser.mockResolvedValue(createEntryRecords(15));
    entryRepo.getInsightsByUser.mockResolvedValue(createInsightRecords(5));
    analysisRepo.getUserPatterns.mockResolvedValue([]);
    analysisRepo.getProfileAnalytics.mockResolvedValue([]);
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      maxHighlights: 5,
    });

    expect(result.collection).toBeDefined();
    expect(result.collection.userId).toBe(TEST_USER_ID);
    expect(result.analytics).toBeDefined();
    expect(result.recommendations).toBeDefined();
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it('should throw on empty userId', async () => {
    await expect(
      useCase.execute({ userId: '' })
    ).rejects.toThrow();
  });

  it('should throw on invalid maxHighlights', async () => {
    await expect(
      useCase.execute({ userId: TEST_USER_ID, maxHighlights: 100 })
    ).rejects.toThrow();
  });

  it('should throw on invalid date range', async () => {
    await expect(
      useCase.execute({
        userId: TEST_USER_ID,
        timeframe: { start: new Date('2026-01-01'), end: new Date('2025-01-01') },
      })
    ).rejects.toThrow();
  });

  it('should handle empty user data gracefully', async () => {
    profileRepo.getProfile.mockResolvedValue(null);
    entryRepo.getEntriesByUser.mockResolvedValue([]);
    entryRepo.getInsightsByUser.mockResolvedValue([]);
    analysisRepo.getUserPatterns.mockResolvedValue([]);
    analysisRepo.getProfileAnalytics.mockResolvedValue([]);
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({ userId: TEST_USER_ID });

    expect(result.collection).toBeDefined();
    expect(result.highlights.length).toBe(0);
  });
});

// ==================== GenerateUserPersonaUseCase ====================
describe('GenerateUserPersonaUseCase', () => {
  let useCase: InstanceType<typeof import('../../../application/use-cases/profile/GenerateUserPersonaUseCase').GenerateUserPersonaUseCase>;
  let profileRepo: ReturnType<typeof createMockProfileRepository>;
  let entryRepo: ReturnType<typeof createMockEntryRepository>;
  let analysisRepo: ReturnType<typeof createMockAnalysisRepository>;
  let personaRepo: ReturnType<typeof createMockPersonaRepository>;
  let personalityAnalyzer: ReturnType<typeof createMockPersonalityAnalyzer>;
  let behaviorAnalyzer: ReturnType<typeof createMockBehaviorAnalyzer>;
  let cognitiveAnalyzer: ReturnType<typeof createMockCognitiveAnalyzer>;
  let socialAnalyzer: ReturnType<typeof createMockSocialAnalyzer>;
  let growthAnalyzer: ReturnType<typeof createMockGrowthAnalyzer>;

  beforeEach(async () => {
    vi.clearAllMocks();
    profileRepo = createMockProfileRepository();
    entryRepo = createMockEntryRepository();
    analysisRepo = createMockAnalysisRepository();
    personaRepo = createMockPersonaRepository();
    personalityAnalyzer = createMockPersonalityAnalyzer();
    behaviorAnalyzer = createMockBehaviorAnalyzer();
    cognitiveAnalyzer = createMockCognitiveAnalyzer();
    socialAnalyzer = createMockSocialAnalyzer();
    growthAnalyzer = createMockGrowthAnalyzer();

    const { GenerateUserPersonaUseCase } = await import('../../../application/use-cases/profile/GenerateUserPersonaUseCase');
    useCase = new GenerateUserPersonaUseCase(
      profileRepo as any,
      entryRepo as any,
      analysisRepo as any,
      personaRepo as any,
      personalityAnalyzer as any,
      behaviorAnalyzer as any,
      cognitiveAnalyzer as any,
      socialAnalyzer as any,
      growthAnalyzer as any
    );
  });

  it('should generate a user persona successfully', async () => {
    entryRepo.getEntriesByUser.mockResolvedValue(createEntryRecords(10));
    entryRepo.getInsightsByUser.mockResolvedValue(createInsightRecords(5));
    analysisRepo.getUserPatterns.mockResolvedValue([]);
    analysisRepo.getProfileAnalytics.mockResolvedValue([]);
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);
    personaRepo.upsertLatestPersona.mockResolvedValue({ id: 'persona-1', userId: TEST_USER_ID });

    const result = await useCase.execute({ userId: TEST_USER_ID });

    expect(result.persona).toBeDefined();
    expect(result.persona.userId).toBe(TEST_USER_ID);
    expect(result.persona.id).toBe('persona-1');
    expect(result.confidenceReport).toBeDefined();
    expect(result.recommendations).toBeDefined();
    expect(result.generatedAt).toBeInstanceOf(Date);
    expect(personaRepo.upsertLatestPersona).toHaveBeenCalled();
  });

  it('should throw on empty userId', async () => {
    await expect(
      useCase.execute({ userId: '' })
    ).rejects.toThrow();
  });

  it('should throw on invalid personalizationDepth', async () => {
    await expect(
      useCase.execute({ userId: TEST_USER_ID, personalizationDepth: 'extreme' as any })
    ).rejects.toThrow();
  });

  it('should throw on invalid date range', async () => {
    await expect(
      useCase.execute({
        userId: TEST_USER_ID,
        timeframe: { start: new Date('2026-01-01'), end: new Date('2025-01-01') },
      })
    ).rejects.toThrow();
  });
});

// ==================== GetLatestPersonaUseCase ====================
describe('GetLatestPersonaUseCase', () => {
  let useCase: InstanceType<typeof import('../../../application/use-cases/profile/GetLatestPersonaUseCase').GetLatestPersonaUseCase>;
  let personaRepo: ReturnType<typeof createMockPersonaRepository>;

  beforeEach(async () => {
    vi.clearAllMocks();
    personaRepo = createMockPersonaRepository();
    const { GetLatestPersonaUseCase } = await import('../../../application/use-cases/profile/GetLatestPersonaUseCase');
    useCase = new GetLatestPersonaUseCase(personaRepo as any);
  });

  it('should return persona when it exists', async () => {
    const mockPersona = {
      id: 'persona-1',
      userId: TEST_USER_ID,
      personaName: 'The Explorer',
      generatedAt: TEST_DATE,
    };
    personaRepo.getLatestPersona.mockResolvedValue(mockPersona);

    const result = await useCase.execute({ userId: TEST_USER_ID });

    expect(result.success).toBe(true);
    expect(result.persona).toEqual(mockPersona);
    expect(result.generatedAt).toBe(TEST_DATE.toISOString());
  });

  it('should return null persona when none exists', async () => {
    personaRepo.getLatestPersona.mockResolvedValue(null);

    const result = await useCase.execute({ userId: TEST_USER_ID });

    expect(result.success).toBe(true);
    expect(result.persona).toBeNull();
    expect(result.generatedAt).toBeNull();
  });

  it('should throw on empty userId', async () => {
    await expect(useCase.execute({ userId: '' })).rejects.toThrow();
  });

  it('should throw on repository failure', async () => {
    personaRepo.getLatestPersona.mockRejectedValue(new Error('DB down'));

    await expect(useCase.execute({ userId: TEST_USER_ID })).rejects.toThrow('Failed to get latest persona');
  });
});

// ==================== ExportUserProfileUseCase ====================
describe('ExportUserProfileUseCase', () => {
  let useCase: InstanceType<typeof import('../../../application/use-cases/profile/ExportUserProfileUseCase').ExportUserProfileUseCase>;
  let profileRepo: ReturnType<typeof createMockProfileRepository>;
  let entryRepo: ReturnType<typeof createMockEntryRepository>;
  let analysisRepo: ReturnType<typeof createMockAnalysisRepository>;

  beforeEach(async () => {
    vi.clearAllMocks();
    profileRepo = createMockProfileRepository();
    entryRepo = createMockEntryRepository();
    analysisRepo = createMockAnalysisRepository();
    const { ExportUserProfileUseCase } = await import('../../../application/use-cases/profile/ExportUserProfileUseCase');
    useCase = new ExportUserProfileUseCase(profileRepo as any, entryRepo as any, analysisRepo as any);
  });

  it('should export profile in JSON format', async () => {
    profileRepo.getProfile.mockResolvedValue(createBasicProfile());
    entryRepo.getEntriesByUser.mockResolvedValue(createEntryRecords(3));
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      format: { type: 'json' },
      scope: { includeBasicProfile: true, includeEntries: true },
    });

    expect(result.status).toBe('completed');
    expect(result.exportId).toContain('export_');
    expect(result.format.type).toBe('json');
    expect(result.recordCount).toBeGreaterThan(0);
  });

  it('should handle profile retrieval error gracefully and still complete', async () => {
    profileRepo.getProfile.mockRejectedValue(new Error('DB error'));
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      format: { type: 'json' },
      scope: { includeBasicProfile: true },
    });

    expect(result.status).toBe('completed');
    expect(result.exportId).toContain('export_');
  });

  it('should throw validation error for empty userId', async () => {
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: '',
      format: { type: 'json' },
      scope: {},
    });

    expect(result.status).toBe('failed');
  });

  it('should throw for invalid export format', async () => {
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      format: { type: 'html' as any },
      scope: {},
    });

    expect(result.status).toBe('failed');
  });

  it('should throw when encryption requested without password', async () => {
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      format: { type: 'json', options: { encryption: true } },
      scope: {},
    });

    expect(result.status).toBe('failed');
  });
});

// ==================== ImportUserProfileUseCase ====================
describe('ImportUserProfileUseCase', () => {
  let useCase: InstanceType<typeof import('../../../application/use-cases/profile/ImportUserProfileUseCase').ImportUserProfileUseCase>;
  let profileRepo: ReturnType<typeof createMockProfileRepository>;
  let entryRepo: ReturnType<typeof createMockEntryRepository>;
  let analysisRepo: ReturnType<typeof createMockAnalysisRepository>;
  let backupRepo: ReturnType<typeof createMockBackupRepository>;

  beforeEach(async () => {
    vi.clearAllMocks();
    profileRepo = createMockProfileRepository();
    entryRepo = createMockEntryRepository();
    analysisRepo = createMockAnalysisRepository();
    backupRepo = createMockBackupRepository();
    const { ImportUserProfileUseCase } = await import('../../../application/use-cases/profile/ImportUserProfileUseCase');
    useCase = new ImportUserProfileUseCase(profileRepo as any, entryRepo as any, analysisRepo as any, backupRepo as any);
  });

  it('should import profile data from file source', async () => {
    profileRepo.getProfile.mockResolvedValue(null);
    entryRepo.getEntriesByUser.mockResolvedValue([]);
    entryRepo.getInsightsByUser.mockResolvedValue([]);
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      dataSource: { type: 'file', format: 'json', source: '/path/to/file.json' },
      options: {
        mergeStrategy: 'merge',
        conflictResolution: 'source_priority',
        validateData: true,
        preserveIds: false,
        createBackup: false,
      },
      scope: { includeEntries: true, includeInsights: true },
    });

    expect(result.importId).toContain('import_');
    expect(result.importedAt).toBeInstanceOf(Date);
  });

  it('should return failed on empty userId', async () => {
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: '',
      dataSource: { type: 'file', format: 'json', source: '/file.json' },
      options: {
        mergeStrategy: 'merge',
        conflictResolution: 'source_priority',
        validateData: true,
        preserveIds: false,
        createBackup: false,
      },
      scope: {},
    });

    expect(result.status).toBe('failed');
  });

  it('should return failed for missing data source type', async () => {
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      dataSource: { type: '' as any, format: 'json', source: '/file.json' },
      options: {
        mergeStrategy: 'merge',
        conflictResolution: 'source_priority',
        validateData: true,
        preserveIds: false,
        createBackup: false,
      },
      scope: {},
    });

    expect(result.status).toBe('failed');
  });

  it('should create backup when requested', async () => {
    profileRepo.getProfile.mockResolvedValue(createBasicProfile());
    entryRepo.getEntriesByUser.mockResolvedValue([]);
    entryRepo.getInsightsByUser.mockResolvedValue([]);
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      dataSource: { type: 'file', format: 'json', source: '/file.json' },
      options: {
        mergeStrategy: 'merge',
        conflictResolution: 'source_priority',
        validateData: true,
        preserveIds: false,
        createBackup: true,
      },
      scope: { includeEntries: true },
    });

    expect(backupRepo.createBackup).toHaveBeenCalled();
    expect(result.backupId).toBeDefined();
  });

  it('should return dry run results without importing', async () => {
    profileRepo.getProfile.mockResolvedValue(null);
    entryRepo.getEntriesByUser.mockResolvedValue([]);
    analysisRepo.recordAnalyticsEvent.mockResolvedValue(undefined);

    const result = await useCase.execute({
      userId: TEST_USER_ID,
      dataSource: { type: 'file', format: 'json', source: '/file.json' },
      options: {
        mergeStrategy: 'merge',
        conflictResolution: 'source_priority',
        validateData: true,
        preserveIds: false,
        createBackup: false,
        dryRun: true,
      },
      scope: { includeEntries: true },
    });

    expect(result.validation).toBeDefined();
    expect(result.importId).toContain('import_');
  });

  it('should handle getBackup and deleteBackup methods', async () => {
    backupRepo.getBackup.mockResolvedValue({
      id: 'backup-1',
      userId: TEST_USER_ID,
      backupData: { profile: null, entries: [], insights: [], books: [], chapters: [] },
      status: 'active',
    });

    const backup = await useCase.getBackup('backup-1');
    expect(backup).toBeDefined();

    const deleted = await useCase.deleteBackup('backup-1');
    expect(deleted).toBe(true);
  });
});
