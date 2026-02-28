/**
 * Framework Selection Service
 * Analyzes user content and selects the most relevant psychological frameworks
 * for personalized therapeutic interventions
 *
 * Now fetches frameworks from ai-config-service database instead of hardcoded values
 */

import { getLogger } from '../../config/service-urls';
import {
  FrameworkCategory,
  FrameworkMatch,
  FrameworkSelectionResult,
  EMOTION_PATTERNS,
  THEME_PATTERNS,
} from '@aiponge/shared-contracts';
import { getEnabledFrameworks, PsychologicalFramework, errorMessage } from '@aiponge/platform-core';

const logger = getLogger('ai-content-service-framework-selection');

export type { FrameworkCategory, FrameworkMatch, FrameworkSelectionResult };
export type { PsychologicalFramework };

export class FrameworkSelectionService {
  private frameworks: PsychologicalFramework[] = [];
  private initialized = false;

  constructor() {
    this.initialize().catch(err => {
      logger.error('Failed to initialize framework service', { error: err.message });
    });
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      this.frameworks = await getEnabledFrameworks();
      this.initialized = true;
      logger.debug(`Initialized with ${this.frameworks.length} active psychological frameworks`);
    } catch (error) {
      logger.error('Failed to fetch frameworks from config service', { error: errorMessage(error) });
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized || this.frameworks.length === 0) {
      await this.initialize();
    }
  }

  async selectFrameworks(
    content: string,
    options?: {
      maxFrameworks?: number;
      preferredCategories?: FrameworkCategory[];
      excludeFrameworks?: string[];
    }
  ): Promise<FrameworkSelectionResult> {
    await this.ensureInitialized();

    const contentLower = content.toLowerCase();
    const detectedEmotions = this.detectPatterns(content, EMOTION_PATTERNS);
    const detectedThemes = this.detectPatterns(content, THEME_PATTERNS);
    const matches = this.scoreFrameworks(contentLower, options);

    return this.buildSelectionResult(matches, detectedEmotions, detectedThemes, options?.maxFrameworks ?? 3);
  }

  async getFrameworkById(id: string): Promise<PsychologicalFramework | undefined> {
    await this.ensureInitialized();
    return this.frameworks.find(f => f.id === id);
  }

  async getAllFrameworks(): Promise<PsychologicalFramework[]> {
    await this.ensureInitialized();
    return [...this.frameworks];
  }

  async getFrameworksByCategory(category: FrameworkCategory): Promise<PsychologicalFramework[]> {
    await this.ensureInitialized();
    return this.frameworks.filter(f => f.category === category);
  }

  async refreshFrameworks(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  private detectPatterns(content: string, patterns: Record<string, RegExp>): Set<string> {
    const detected: Set<string> = new Set();
    for (const [key, pattern] of Object.entries(patterns) as [string, RegExp][]) {
      if (pattern.test(content)) {
        detected.add(key);
      }
    }
    return detected;
  }

  private scoreFrameworks(
    contentLower: string,
    options?: {
      preferredCategories?: FrameworkCategory[];
      excludeFrameworks?: string[];
    }
  ): FrameworkMatch[] {
    const matches: FrameworkMatch[] = [];

    for (const framework of this.frameworks) {
      if (options?.excludeFrameworks?.includes(framework.id)) continue;

      if (
        options?.preferredCategories?.length &&
        !options.preferredCategories.includes(framework.category as FrameworkCategory)
      ) {
        continue;
      }

      const match = this.scoreFramework(framework, contentLower);
      if (match) {
        matches.push(match);
      }
    }

    return matches;
  }

  private buildSelectionResult(
    matches: FrameworkMatch[],
    detectedEmotions: Set<string>,
    detectedThemes: Set<string>,
    maxFrameworks: number
  ): FrameworkSelectionResult {
    matches.sort((a, b) => b.score - a.score);

    const primaryFramework = matches[0] || null;
    const supportingFrameworks = matches.slice(1, maxFrameworks);
    const emotions = Array.from(detectedEmotions);
    const themes = Array.from(detectedThemes);

    const therapeuticApproach = this.buildTherapeuticApproach(primaryFramework, supportingFrameworks, emotions, themes);

    const songStructureGuidance = this.buildSongStructureGuidance(primaryFramework, supportingFrameworks);

    logger.info('Framework selection complete', {
      primaryFramework: primaryFramework?.framework.shortName,
      supportingCount: supportingFrameworks.length,
      emotionsDetected: emotions,
      themesDetected: themes,
    });

    return {
      primaryFramework,
      supportingFrameworks,
      detectedEmotions: emotions,
      detectedThemes: themes,
      therapeuticApproach,
      songStructureGuidance,
    };
  }

  private scoreFramework(framework: PsychologicalFramework, contentLower: string): FrameworkMatch | null {
    const { matchedPatterns, score: triggerScore } = this.scoreTriggerPatterns(framework.triggerPatterns, contentLower);
    const principleScore = this.scoreKeyPrinciples(framework.keyPrinciples, contentLower);
    const score = triggerScore + principleScore;

    if (score <= 0) return null;

    return this.createFrameworkMatch(framework, score, matchedPatterns);
  }

  private scoreTriggerPatterns(
    triggerPatterns: string[],
    contentLower: string
  ): { matchedPatterns: string[]; score: number } {
    const matchedPatterns: string[] = [];
    let score = 0;

    for (const pattern of triggerPatterns) {
      const regex = new RegExp(`\\b${this.escapeRegex(pattern)}\\b`, 'gi');
      const patternMatches = contentLower.match(regex);
      if (patternMatches) {
        matchedPatterns.push(pattern);
        score += patternMatches.length * 10;
      }
    }

    return { matchedPatterns, score };
  }

  private scoreKeyPrinciples(keyPrinciples: string[], contentLower: string): number {
    let score = 0;

    for (const principle of keyPrinciples) {
      const words = principle
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 4);
      for (const word of words) {
        if (contentLower.includes(word)) {
          score += 3;
        }
      }
    }

    return score;
  }

  private createFrameworkMatch(
    framework: PsychologicalFramework,
    score: number,
    matchedPatterns: string[]
  ): FrameworkMatch {
    const confidence = score >= 30 ? 'high' : score >= 15 ? 'medium' : 'low';
    return {
      framework: {
        id: framework.id,
        name: framework.name,
        shortName: framework.shortName,
        category: framework.category as FrameworkCategory,
        description: framework.description,
        keyPrinciples: framework.keyPrinciples,
        therapeuticGoals: framework.therapeuticGoals,
        triggerPatterns: framework.triggerPatterns,
        songStructureHint: framework.songStructureHint,
        enabled: framework.enabled,
      },
      score,
      matchedPatterns,
      confidence,
    };
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private buildTherapeuticApproach(
    primary: FrameworkMatch | null,
    supporting: FrameworkMatch[],
    emotions: string[],
    themes: string[]
  ): string {
    if (!primary) {
      return 'Apply general supportive and empathetic principles. Focus on validation and gentle exploration.';
    }

    const parts: string[] = [];

    parts.push(`Primary approach: ${primary.framework.name} (${primary.framework.shortName}).`);
    parts.push(`Core principles: ${primary.framework.keyPrinciples.slice(0, 2).join(', ')}.`);

    if (supporting.length > 0) {
      const supportingNames = supporting.map(s => s.framework.shortName).join(', ');
      parts.push(`Supporting frameworks: ${supportingNames}.`);
    }

    if (emotions.length > 0) {
      parts.push(`Address detected emotions: ${emotions.join(', ')}.`);
    }

    if (themes.length > 0) {
      parts.push(`Consider themes: ${themes.join(', ')}.`);
    }

    parts.push(
      `Therapeutic goals: ${primary.framework.therapeuticGoals
        .slice(0, 2)
        .map(g => g.replace(/_/g, ' '))
        .join(', ')}.`
    );

    return parts.join(' ');
  }

  private buildSongStructureGuidance(primary: FrameworkMatch | null, supporting: FrameworkMatch[]): string {
    if (!primary?.framework.songStructureHint) {
      return "Create an emotionally resonant song that validates the listener's experience and offers gentle hope.";
    }

    const parts: string[] = [];
    parts.push(`Primary structure: ${primary.framework.songStructureHint}.`);

    const additionalHints = supporting
      .filter(s => s.framework.songStructureHint)
      .slice(0, 2)
      .map(s => s.framework.songStructureHint);

    if (additionalHints.length > 0) {
      parts.push(`Additional elements: ${additionalHints.join('. ')}.`);
    }

    return parts.join(' ');
  }
}

export const frameworkSelectionService = new FrameworkSelectionService();
