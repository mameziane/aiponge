import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLogger = vi.hoisted(() => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
}));

const mockFrameworks = vi.hoisted(() => [
  {
    id: 'cbt',
    name: 'Cognitive Behavioral Therapy',
    shortName: 'CBT',
    category: 'cognitive',
    description: 'Focuses on changing negative thought patterns',
    keyPrinciples: ['thought restructuring', 'behavioral activation', 'cognitive distortion identification'],
    therapeuticGoals: ['reduce_anxiety', 'improve_mood'],
    triggerPatterns: ['anxious', 'worried', 'negative thoughts', 'overthinking'],
    songStructureHint: 'Start with acknowledging the struggle, then reframe with hope',
    enabled: true,
  },
  {
    id: 'act',
    name: 'Acceptance and Commitment Therapy',
    shortName: 'ACT',
    category: 'mindfulness',
    description: 'Encourages acceptance of difficult emotions',
    keyPrinciples: ['psychological flexibility', 'acceptance', 'values-based action'],
    therapeuticGoals: ['emotional_acceptance', 'valued_living'],
    triggerPatterns: ['acceptance', 'values', 'meaning', 'stuck'],
    songStructureHint: 'Build from acceptance toward commitment to values',
    enabled: true,
  },
  {
    id: 'dbt',
    name: 'Dialectical Behavior Therapy',
    shortName: 'DBT',
    category: 'emotional_regulation',
    description: 'Skills-based approach for emotional regulation',
    keyPrinciples: ['mindfulness', 'distress tolerance', 'emotional regulation'],
    therapeuticGoals: ['emotion_management', 'interpersonal_effectiveness'],
    triggerPatterns: ['overwhelmed', 'intense emotions', 'self-harm', 'crisis'],
    songStructureHint: 'Validate the intensity, then introduce grounding and skills',
    enabled: true,
  },
]);

vi.mock('@aiponge/platform-core', () => ({
  createLogger: () => mockLogger,
  getLogger: () => mockLogger,
  getEnabledFrameworks: vi.fn().mockResolvedValue(mockFrameworks),
  DomainError: class DomainError extends Error {
    public readonly statusCode: number;
    constructor(message: string, statusCode: number = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('../config/service-urls', () => ({
  getLogger: () => mockLogger,
  getServiceUrls: () => ({}),
}));

vi.mock('@aiponge/shared-contracts', () => ({
  EMOTION_PATTERNS: {
    anxiety: /\b(anxious|anxiety|worried|worry|nervous)\b/i,
    sadness: /\b(sad|depressed|down|hopeless|crying)\b/i,
    anger: /\b(angry|furious|rage|frustrated|irritated)\b/i,
  },
  THEME_PATTERNS: {
    self_worth: /\b(worthless|not good enough|failure|inadequate)\b/i,
    relationships: /\b(relationship|partner|friend|family|lonely)\b/i,
    loss: /\b(loss|grief|died|death|mourning)\b/i,
  },
}));

import { FrameworkSelectionService, type FrameworkCategory } from '../domains/services/FrameworkSelectionService';
const { getEnabledFrameworks: mockGetEnabledFrameworks } = vi.mocked(await import('@aiponge/platform-core'));

describe('FrameworkSelectionService', () => {
  let service: FrameworkSelectionService;

  beforeEach(async () => {
    vi.clearAllMocks();
    service = new FrameworkSelectionService();
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  describe('selectFrameworks', () => {
    it('should select frameworks matching content patterns', async () => {
      const result = await service.selectFrameworks('I feel so anxious and worried about everything');

      expect(result.primaryFramework).not.toBeNull();
      expect(result.primaryFramework!.framework.id).toBe('cbt');
      expect(result.primaryFramework!.matchedPatterns).toContain('anxious');
    });

    it('should detect emotions from content', async () => {
      const result = await service.selectFrameworks('I am feeling so anxious and sad');

      expect(result.detectedEmotions).toContain('anxiety');
      expect(result.detectedEmotions).toContain('sadness');
    });

    it('should detect themes from content', async () => {
      const result = await service.selectFrameworks('My relationship is falling apart and I feel worthless');

      expect(result.detectedThemes).toContain('self_worth');
      expect(result.detectedThemes).toContain('relationships');
    });

    it('should limit supporting frameworks to maxFrameworks - 1', async () => {
      const result = await service.selectFrameworks(
        'I feel anxious and overwhelmed, stuck in negative thoughts',
        { maxFrameworks: 2 }
      );

      expect(result.supportingFrameworks.length).toBeLessThanOrEqual(1);
    });

    it('should exclude specified frameworks', async () => {
      const result = await service.selectFrameworks('I feel anxious and worried', {
        excludeFrameworks: ['cbt'],
      });

      if (result.primaryFramework) {
        expect(result.primaryFramework.framework.id).not.toBe('cbt');
      }
    });

    it('should filter by preferred categories', async () => {
      const result = await service.selectFrameworks(
        'I feel anxious and overwhelmed with intense emotions',
        { preferredCategories: ['mindfulness'] }
      );

      if (result.primaryFramework) {
        expect(result.primaryFramework.framework.category).toBe('mindfulness');
      }
    });

    it('should return default therapeutic approach when no match', async () => {
      const result = await service.selectFrameworks('hello world');

      expect(result.therapeuticApproach).toContain('general supportive');
    });

    it('should build therapeutic approach with primary framework', async () => {
      const result = await service.selectFrameworks('I feel so anxious and worried');

      expect(result.therapeuticApproach).toContain('Cognitive Behavioral Therapy');
    });

    it('should include song structure guidance', async () => {
      const result = await service.selectFrameworks('I feel overwhelmed with intense emotions');

      expect(result.songStructureGuidance).toBeTruthy();
    });

    it('should return default song guidance when no match', async () => {
      const result = await service.selectFrameworks('hello world');
      expect(result.songStructureGuidance).toContain('emotionally resonant');
    });
  });

  describe('getFrameworkById', () => {
    it('should return framework by id', async () => {
      const framework = await service.getFrameworkById('cbt');
      expect(framework).toBeDefined();
      expect(framework!.name).toBe('Cognitive Behavioral Therapy');
    });

    it('should return undefined for unknown id', async () => {
      const framework = await service.getFrameworkById('unknown');
      expect(framework).toBeUndefined();
    });
  });

  describe('getAllFrameworks', () => {
    it('should return all frameworks', async () => {
      const frameworks = await service.getAllFrameworks();
      expect(frameworks).toHaveLength(3);
    });

    it('should return a copy of frameworks array', async () => {
      const frameworks = await service.getAllFrameworks();
      frameworks.push({} as unknown as (typeof frameworks)[0]);
      const original = await service.getAllFrameworks();
      expect(original).toHaveLength(3);
    });
  });

  describe('getFrameworksByCategory', () => {
    it('should return frameworks matching category', async () => {
      const frameworks = await service.getFrameworksByCategory('cognitive');
      expect(frameworks).toHaveLength(1);
      expect(frameworks[0].id).toBe('cbt');
    });

    it('should return empty array for unknown category', async () => {
      const frameworks = await service.getFrameworksByCategory('nonexistent' as unknown as FrameworkCategory);
      expect(frameworks).toHaveLength(0);
    });
  });

  describe('refreshFrameworks', () => {
    it('should re-fetch frameworks', async () => {
      const { getEnabledFrameworks } = await import('@aiponge/platform-core');
      await service.refreshFrameworks();
      expect(getEnabledFrameworks).toHaveBeenCalled();
    });
  });

  describe('confidence scoring', () => {
    it('should assign high confidence for strong matches', async () => {
      const result = await service.selectFrameworks(
        'anxious anxious anxious worried worried negative thoughts overthinking'
      );

      if (result.primaryFramework) {
        expect(result.primaryFramework.confidence).toBe('high');
      }
    });

    it('should assign lower confidence for weak matches', async () => {
      const result = await service.selectFrameworks('I feel a bit worried');

      if (result.primaryFramework) {
        expect(['low', 'medium']).toContain(result.primaryFramework.confidence);
      }
    });
  });
});
