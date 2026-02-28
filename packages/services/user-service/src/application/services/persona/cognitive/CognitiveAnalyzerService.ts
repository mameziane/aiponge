/**
 * Cognitive Analyzer Service
 * Analyzes thinking patterns, problem-solving style, and cognitive metrics
 */

import type { ICognitiveAnalyzer } from '../interfaces/ICognitiveAnalyzer';
import type { PersonaAnalysisInput, CognitiveData, PersonalizationDepth, EntryItem } from '../types';

export class CognitiveAnalyzerService implements ICognitiveAnalyzer {
  async analyze(input: PersonaAnalysisInput, _depth: PersonalizationDepth): Promise<CognitiveData> {
    const { entries } = input;

    const thinkingPatterns = this.extractThinkingPatterns(entries);
    const problemSolvingStyle = this.analyzeProblemSolvingStyle(entries);
    const creativity = this.calculateCreativityScore(entries);
    const analyticalThinking = this.calculateAnalyticalThinking(entries);
    const intuitiveThinkers = this.calculateIntuitiveThinking(entries);

    return {
      thinkingPatterns,
      problemSolvingStyle,
      creativity,
      analyticalThinking,
      intuitiveThinkers,
    };
  }

  private extractThinkingPatterns(entries: EntryItem[]): string[] {
    const patterns: string[] = [];
    const content = entries.map(t => t.content.toLowerCase()).join(' ');

    if (content.includes('analyze') || content.includes('break down') || content.includes('examine')) {
      patterns.push('Analytical reasoning');
    }
    if (content.includes('pattern') || content.includes('connect') || content.includes('relate')) {
      patterns.push('Pattern recognition');
    }
    if (content.includes('system') || content.includes('whole') || content.includes('big picture')) {
      patterns.push('Systems thinking');
    }
    if (content.includes('creative') || content.includes('imagine') || content.includes('new idea')) {
      patterns.push('Creative thinking');
    }
    if (content.includes('reflect') || content.includes('consider') || content.includes('think about')) {
      patterns.push('Reflective thinking');
    }

    return patterns.length > 0 ? patterns : ['Analytical reasoning', 'Pattern recognition', 'Systems thinking'];
  }

  private analyzeProblemSolvingStyle(entries: EntryItem[]): string {
    const systematicCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('step by step') ||
        t.content.toLowerCase().includes('systematic') ||
        t.content.toLowerCase().includes('process')
    ).length;

    const creativeCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('creative') ||
        t.content.toLowerCase().includes('new approach') ||
        t.content.toLowerCase().includes('innovative')
    ).length;

    const collaborativeCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('together') ||
        t.content.toLowerCase().includes('team') ||
        t.content.toLowerCase().includes('collaborate')
    ).length;

    if (systematicCues >= creativeCues && systematicCues >= collaborativeCues) {
      if (collaborativeCues > 0) return 'Systematic and collaborative';
      return 'Systematic and methodical';
    }
    if (creativeCues >= systematicCues && creativeCues >= collaborativeCues) {
      return 'Creative and innovative';
    }
    return 'Systematic and collaborative';
  }

  private calculateCreativityScore(entries: EntryItem[]): number {
    if (entries.length === 0) return 0.5;

    const creativeCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('creative') ||
        t.content.toLowerCase().includes('imagine') ||
        t.content.toLowerCase().includes('innovative') ||
        t.content.toLowerCase().includes('idea') ||
        t.type === 'poem' ||
        t.type === 'story'
    ).length;

    return Math.min(1.0, Math.max(0.3, creativeCues / Math.max(entries.length * 0.2, 1)));
  }

  private calculateAnalyticalThinking(entries: EntryItem[]): number {
    if (entries.length === 0) return 0.5;

    const analyticalCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('analyze') ||
        t.content.toLowerCase().includes('logical') ||
        t.content.toLowerCase().includes('reason') ||
        t.content.toLowerCase().includes('evidence') ||
        t.content.toLowerCase().includes('data')
    ).length;

    return Math.min(1.0, Math.max(0.3, analyticalCues / Math.max(entries.length * 0.15, 1)));
  }

  private calculateIntuitiveThinking(entries: EntryItem[]): number {
    if (entries.length === 0) return 0.5;

    const intuitiveCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('feel') ||
        t.content.toLowerCase().includes('intuition') ||
        t.content.toLowerCase().includes('gut') ||
        t.content.toLowerCase().includes('sense')
    ).length;

    return Math.min(1.0, Math.max(0.3, intuitiveCues / Math.max(entries.length * 0.15, 1)));
  }
}
