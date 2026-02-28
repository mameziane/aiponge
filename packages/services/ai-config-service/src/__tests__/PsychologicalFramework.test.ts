import { describe, it, expect } from 'vitest';
import type {
  PsychologicalFramework,
  FrameworkCategory,
  FrameworkFilter,
} from '../domains/frameworks/domain/entities/PsychologicalFramework';

describe('PsychologicalFramework', () => {
  describe('PsychologicalFramework entity', () => {
    it('should define valid framework structure', () => {
      const framework: PsychologicalFramework = {
        id: 'cbt-001',
        name: 'Cognitive Behavioral Therapy',
        shortName: 'CBT',
        category: 'cognitive',
        description: 'A structured, time-limited therapy focusing on thoughts and behaviors',
        keyPrinciples: [
          'Thoughts influence feelings and behaviors',
          'Cognitive distortions can be identified and corrected',
          'Skills-based approach to problem solving',
        ],
        therapeuticGoals: [
          'Identify negative thought patterns',
          'Develop coping strategies',
          'Reduce symptoms of anxiety and depression',
        ],
        triggerPatterns: ['anxiety', 'depression', 'stress', 'negative thinking'],
        songStructureHint: 'Progressive journey from struggle to resolution',
        isEnabled: true,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(framework.id).toBe('cbt-001');
      expect(framework.name).toBe('Cognitive Behavioral Therapy');
      expect(framework.shortName).toBe('CBT');
      expect(framework.category).toBe('cognitive');
      expect(framework.keyPrinciples).toHaveLength(3);
      expect(framework.therapeuticGoals).toHaveLength(3);
      expect(framework.triggerPatterns).toContain('anxiety');
      expect(framework.isEnabled).toBe(true);
    });

    it('should allow null songStructureHint', () => {
      const framework: PsychologicalFramework = {
        id: 'mindfulness-001',
        name: 'Mindfulness-Based Stress Reduction',
        shortName: 'MBSR',
        category: 'mindfulness',
        description: 'Mindfulness meditation practice for stress reduction',
        keyPrinciples: ['Present moment awareness', 'Non-judgmental observation'],
        therapeuticGoals: ['Reduce stress', 'Increase awareness'],
        triggerPatterns: ['stress', 'overwhelm'],
        songStructureHint: null,
        isEnabled: true,
        sortOrder: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(framework.songStructureHint).toBeNull();
    });
  });

  describe('FrameworkCategory', () => {
    it('should support all valid categories', () => {
      const categories: FrameworkCategory[] = [
        'cognitive',
        'behavioral',
        'humanistic',
        'psychodynamic',
        'integrative',
        'somatic',
        'mindfulness',
        'positive',
        'existential',
      ];

      expect(categories).toHaveLength(9);
      expect(categories).toContain('cognitive');
      expect(categories).toContain('behavioral');
      expect(categories).toContain('humanistic');
      expect(categories).toContain('psychodynamic');
      expect(categories).toContain('integrative');
      expect(categories).toContain('somatic');
      expect(categories).toContain('mindfulness');
      expect(categories).toContain('positive');
      expect(categories).toContain('existential');
    });

    it('should use categories in frameworks correctly', () => {
      const cognitiveFramework: PsychologicalFramework = {
        id: 'test-1',
        name: 'Test Cognitive',
        shortName: 'TC',
        category: 'cognitive',
        description: 'Test',
        keyPrinciples: [],
        therapeuticGoals: [],
        triggerPatterns: [],
        songStructureHint: null,
        isEnabled: true,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const somaticFramework: PsychologicalFramework = {
        id: 'test-2',
        name: 'Test Somatic',
        shortName: 'TS',
        category: 'somatic',
        description: 'Test',
        keyPrinciples: [],
        therapeuticGoals: [],
        triggerPatterns: [],
        songStructureHint: null,
        isEnabled: true,
        sortOrder: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(cognitiveFramework.category).toBe('cognitive');
      expect(somaticFramework.category).toBe('somatic');
    });
  });

  describe('FrameworkFilter', () => {
    it('should filter by category', () => {
      const filter: FrameworkFilter = {
        category: 'mindfulness',
      };

      expect(filter.category).toBe('mindfulness');
      expect(filter.isEnabled).toBeUndefined();
    });

    it('should filter by enabled status', () => {
      const filter: FrameworkFilter = {
        isEnabled: true,
      };

      expect(filter.isEnabled).toBe(true);
      expect(filter.category).toBeUndefined();
    });

    it('should filter by both category and enabled', () => {
      const filter: FrameworkFilter = {
        category: 'positive',
        isEnabled: true,
      };

      expect(filter.category).toBe('positive');
      expect(filter.isEnabled).toBe(true);
    });

    it('should allow empty filter', () => {
      const filter: FrameworkFilter = {};
      expect(Object.keys(filter)).toHaveLength(0);
    });
  });

  describe('Framework collections', () => {
    it('should support array of frameworks', () => {
      const frameworks: PsychologicalFramework[] = [
        {
          id: 'dbt-001',
          name: 'Dialectical Behavior Therapy',
          shortName: 'DBT',
          category: 'integrative',
          description: 'Combines CBT with mindfulness',
          keyPrinciples: ['Dialectics', 'Mindfulness', 'Distress tolerance'],
          therapeuticGoals: ['Emotional regulation', 'Interpersonal effectiveness'],
          triggerPatterns: ['emotional dysregulation', 'self-harm'],
          songStructureHint: 'Balance between opposing forces',
          isEnabled: true,
          sortOrder: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'act-001',
          name: 'Acceptance and Commitment Therapy',
          shortName: 'ACT',
          category: 'behavioral',
          description: 'Focus on psychological flexibility',
          keyPrinciples: ['Acceptance', 'Defusion', 'Values'],
          therapeuticGoals: ['Increase psychological flexibility', 'Live aligned with values'],
          triggerPatterns: ['avoidance', 'stuck patterns'],
          songStructureHint: 'Movement from avoidance to engagement',
          isEnabled: true,
          sortOrder: 4,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      expect(frameworks).toHaveLength(2);
      expect(frameworks[0].shortName).toBe('DBT');
      expect(frameworks[1].shortName).toBe('ACT');
    });

    it('should sort frameworks by sortOrder', () => {
      const frameworks: PsychologicalFramework[] = [
        {
          id: '3',
          name: 'Third',
          shortName: 'T3',
          category: 'cognitive',
          description: '',
          keyPrinciples: [],
          therapeuticGoals: [],
          triggerPatterns: [],
          songStructureHint: null,
          isEnabled: true,
          sortOrder: 3,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '1',
          name: 'First',
          shortName: 'T1',
          category: 'cognitive',
          description: '',
          keyPrinciples: [],
          therapeuticGoals: [],
          triggerPatterns: [],
          songStructureHint: null,
          isEnabled: true,
          sortOrder: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          name: 'Second',
          shortName: 'T2',
          category: 'cognitive',
          description: '',
          keyPrinciples: [],
          therapeuticGoals: [],
          triggerPatterns: [],
          songStructureHint: null,
          isEnabled: true,
          sortOrder: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const sorted = [...frameworks].sort((a, b) => a.sortOrder - b.sortOrder);
      expect(sorted[0].name).toBe('First');
      expect(sorted[1].name).toBe('Second');
      expect(sorted[2].name).toBe('Third');
    });
  });
});
