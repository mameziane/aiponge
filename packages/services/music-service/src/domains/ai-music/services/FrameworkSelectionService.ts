/**
 * Framework Selection Service for Music Generation
 * Analyzes user content and selects the most relevant psychological frameworks
 * for personalized therapeutic music generation with song structure hints
 *
 * Now fetches frameworks from ai-config-service database instead of hardcoded values
 */

import { getLogger } from '@config/service-urls';
import {
  FrameworkCategory,
  FrameworkMatch,
  FrameworkSelectionResult,
  EMOTION_PATTERNS,
  THEME_PATTERNS,
} from '@aiponge/shared-contracts';
import { getEnabledFrameworks, PsychologicalFramework, errorMessage } from '@aiponge/platform-core';

const logger = getLogger('music-service-framework-selection');

export type { FrameworkCategory, FrameworkMatch };
export type { PsychologicalFramework };

export type MusicFrameworkSelectionResult = FrameworkSelectionResult;

export class MusicFrameworkSelectionService {
  private frameworks: PsychologicalFramework[] = [];
  private initialized = false;

  constructor() {
    this.initialize().catch(err => {
      logger.error('Failed to initialize music framework service', { error: err.message });
    });
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      this.frameworks = await getEnabledFrameworks();
      this.initialized = true;
      logger.debug(`Initialized with ${this.frameworks.length} active psychological frameworks for music`);
    } catch (error) {
      logger.error('Failed to fetch frameworks from config service', { error: errorMessage(error) });
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized || this.frameworks.length === 0) {
      await this.initialize();
    }
  }

  async selectFrameworksForMusic(
    content: string,
    options?: {
      maxFrameworks?: number;
      preferredCategories?: FrameworkCategory[];
    }
  ): Promise<MusicFrameworkSelectionResult> {
    await this.ensureInitialized();

    const maxFrameworks = options?.maxFrameworks ?? 3;
    const contentLower = content.toLowerCase();

    const matches: FrameworkMatch[] = [];
    const detectedEmotions: Set<string> = new Set();
    const detectedThemes: Set<string> = new Set();

    for (const [emotion, pattern] of Object.entries(EMOTION_PATTERNS) as [string, RegExp][]) {
      if (pattern.test(content)) {
        detectedEmotions.add(emotion);
      }
    }

    for (const [theme, pattern] of Object.entries(THEME_PATTERNS) as [string, RegExp][]) {
      if (pattern.test(content)) {
        detectedThemes.add(theme);
      }
    }

    for (const framework of this.frameworks) {
      if (
        options?.preferredCategories?.length &&
        !options.preferredCategories.includes(framework.category as FrameworkCategory)
      ) {
        continue;
      }

      const matchedPatterns: string[] = [];
      let score = 0;

      for (const pattern of framework.triggerPatterns) {
        const regex = new RegExp(`\\b${this.escapeRegex(pattern)}\\b`, 'gi');
        const patternMatches = contentLower.match(regex);
        if (patternMatches) {
          matchedPatterns.push(pattern);
          score += patternMatches.length * 10;
        }
      }

      for (const principle of framework.keyPrinciples) {
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

      if (score > 0) {
        const confidence = score >= 30 ? 'high' : score >= 15 ? 'medium' : 'low';
        matches.push({
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
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);

    const primaryFramework = matches[0] || null;
    const supportingFrameworks = matches.slice(1, maxFrameworks);

    const therapeuticApproach = this.buildTherapeuticApproach(
      primaryFramework,
      supportingFrameworks,
      Array.from(detectedEmotions),
      Array.from(detectedThemes)
    );

    const songStructureGuidance = this.buildSongStructureGuidance(primaryFramework, supportingFrameworks);

    logger.info('Music framework selection complete', {
      primaryFramework: primaryFramework?.framework.shortName,
      supportingCount: supportingFrameworks.length,
      emotionsDetected: Array.from(detectedEmotions),
      songStructureGuidance: songStructureGuidance.substring(0, 100),
    });

    return {
      primaryFramework,
      supportingFrameworks,
      detectedEmotions: Array.from(detectedEmotions),
      detectedThemes: Array.from(detectedThemes),
      therapeuticApproach,
      songStructureGuidance,
    };
  }

  async refreshFrameworks(): Promise<void> {
    this.initialized = false;
    await this.initialize();
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
      return "Create emotionally supportive music that validates the listener's experience and offers gentle hope.";
    }

    const parts: string[] = [];

    parts.push(`Apply ${primary.framework.name} (${primary.framework.shortName}) principles.`);
    parts.push(`Focus on: ${primary.framework.keyPrinciples.slice(0, 2).join(', ')}.`);

    if (supporting.length > 0) {
      parts.push(`Blend with ${supporting.map(s => s.framework.shortName).join(', ')} elements.`);
    }

    if (emotions.length > 0) {
      parts.push(`Address: ${emotions.join(', ')}.`);
    }

    if (themes.length > 0) {
      parts.push(`Explore: ${themes.join(', ')}.`);
    }

    return parts.join(' ');
  }

  private buildSongStructureGuidance(primary: FrameworkMatch | null, supporting: FrameworkMatch[]): string {
    if (!primary?.framework.songStructureHint) {
      return "Create an emotionally resonant song that validates the listener's experience and offers gentle hope. Use verse-chorus structure with building dynamics.";
    }

    const parts: string[] = [];
    parts.push(primary.framework.songStructureHint);

    const additionalHints = supporting
      .filter(s => s.framework.songStructureHint)
      .slice(0, 1)
      .map(s => s.framework.songStructureHint);

    if (additionalHints.length > 0) {
      parts.push(`Also incorporate: ${additionalHints[0]}`);
    }

    return parts.join(' ');
  }
}

export const musicFrameworkSelectionService = new MusicFrameworkSelectionService();
