/**
 * Behavior Analyzer Service
 * Analyzes behavior patterns, preferences, motivators and stressors
 */

import type { IBehaviorAnalyzer } from '../interfaces/IBehaviorAnalyzer';
import type {
  PersonaAnalysisInput,
  BehaviorData,
  PersonalizationDepth,
  EntryItem,
  InsightEntry,
  BehaviorPattern,
  BehaviorPreferences,
} from '../types';

export class BehaviorAnalyzerService implements IBehaviorAnalyzer {
  async analyze(input: PersonaAnalysisInput, _depth: PersonalizationDepth): Promise<BehaviorData> {
    const { entries, insights, patterns } = input;

    const behaviorPatterns: BehaviorPattern[] = patterns
      .filter(p => p.patternType === 'behavioral')
      .map(p => ({
        pattern: p.patternName,
        frequency: p.frequency ?? 1,
        strength: Number(p.strength) || 0,
        trend: (p.trend as 'increasing' | 'decreasing' | 'stable') || 'stable',
        timeframe: this.calculateTimeframe(this.toDate(p.firstObserved), this.toDate(p.lastObserved)),
        examples: p.triggerFactors || [],
      }));

    const preferences: BehaviorPreferences = {
      communicationStyle: this.analyzeCommunicationStyle(entries),
      learningStyle: this.analyzeLearningStyle(entries),
      decisionMaking: this.analyzeDecisionMaking(entries),
      conflictResolution: this.analyzeConflictResolution(entries),
    };

    const motivators = this.extractMotivators(entries, insights);
    const stressors = this.extractStressors(entries, insights);

    return {
      patterns: behaviorPatterns,
      preferences,
      motivators,
      stressors,
    };
  }

  private toDate(value: Date | string | unknown): Date {
    if (value instanceof Date) return value;
    if (typeof value === 'string') return new Date(value);
    return new Date();
  }

  private calculateTimeframe(start: Date, end: Date): string {
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (days > 180) return 'long-term';
    if (days > 30) return 'medium-term';
    return 'short-term';
  }

  private analyzeCommunicationStyle(entries: EntryItem[]): string {
    const directCues = entries.filter(
      t => t.content.toLowerCase().includes('directly') || t.content.toLowerCase().includes('straightforward')
    ).length;

    const reflectiveCues = entries.filter(
      t => t.content.toLowerCase().includes('think about') || t.content.toLowerCase().includes('consider')
    ).length;

    if (directCues > reflectiveCues) return 'Direct and assertive';
    if (reflectiveCues > directCues) return 'Thoughtful and reflective';
    return 'Direct and thoughtful';
  }

  private analyzeLearningStyle(entries: EntryItem[]): string {
    const visualCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('see') ||
        t.content.toLowerCase().includes('visualize') ||
        t.content.toLowerCase().includes('picture')
    ).length;

    const experientialCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('try') ||
        t.content.toLowerCase().includes('experience') ||
        t.content.toLowerCase().includes('practice')
    ).length;

    const readingCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('read') ||
        t.content.toLowerCase().includes('study') ||
        t.content.toLowerCase().includes('research')
    ).length;

    const max = Math.max(visualCues, experientialCues, readingCues);
    if (max === visualCues && visualCues > 0) return 'Visual learner';
    if (max === experientialCues && experientialCues > 0) return 'Experiential learner';
    if (max === readingCues && readingCues > 0) return 'Reading/writing learner';
    return 'Visual and experiential';
  }

  private analyzeDecisionMaking(entries: EntryItem[]): string {
    const analyticalCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('analyze') ||
        t.content.toLowerCase().includes('pros and cons') ||
        t.content.toLowerCase().includes('logical')
    ).length;

    const intuitiveCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('feel') ||
        t.content.toLowerCase().includes('gut') ||
        t.content.toLowerCase().includes('intuition')
    ).length;

    if (analyticalCues > intuitiveCues * 2) return 'Analytical and data-driven';
    if (intuitiveCues > analyticalCues * 2) return 'Intuitive and feeling-based';
    return 'Analytical with intuitive inputs';
  }

  private analyzeConflictResolution(entries: EntryItem[]): string {
    const collaborativeCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('together') ||
        t.content.toLowerCase().includes('collaborate') ||
        t.content.toLowerCase().includes('compromise')
    ).length;

    const avoidanceCues = entries.filter(
      t => t.content.toLowerCase().includes('avoid') || t.content.toLowerCase().includes('step back')
    ).length;

    if (collaborativeCues > avoidanceCues) return 'Collaborative problem-solving';
    if (avoidanceCues > collaborativeCues) return 'Avoidance and reflection';
    return 'Collaborative problem-solving';
  }

  private extractMotivators(entries: EntryItem[], insights: InsightEntry[]): string[] {
    const motivators: string[] = [];
    const content = entries.map(t => t.content.toLowerCase()).join(' ');

    if (content.includes('grow') || content.includes('improve') || content.includes('develop')) {
      motivators.push('Personal growth');
    }
    if (content.includes('achieve') || content.includes('accomplish') || content.includes('succeed')) {
      motivators.push('Achievement');
    }
    if (content.includes('learn') || content.includes('discover') || content.includes('understand')) {
      motivators.push('Learning');
    }
    if (content.includes('connect') || content.includes('relationship') || content.includes('together')) {
      motivators.push('Connection');
    }
    if (content.includes('help') || content.includes('support') || content.includes('contribute')) {
      motivators.push('Helping others');
    }

    return motivators.length > 0 ? motivators : ['Personal growth', 'Achievement', 'Learning', 'Connection'];
  }

  private extractStressors(entries: EntryItem[], _insights: InsightEntry[]): string[] {
    const stressors: string[] = [];
    const content = entries.map(t => t.content.toLowerCase()).join(' ');

    if (content.includes('deadline') || content.includes('rush') || content.includes('hurry')) {
      stressors.push('Time pressure');
    }
    if (content.includes('uncertain') || content.includes('unknown') || content.includes('unclear')) {
      stressors.push('Uncertainty');
    }
    if (content.includes('conflict') || content.includes('disagree') || content.includes('argument')) {
      stressors.push('Conflict');
    }
    if (content.includes('overwhelm') || content.includes('too much') || content.includes('overload')) {
      stressors.push('Overwhelm');
    }

    return stressors.length > 0 ? stressors : ['Time pressure', 'Uncertainty', 'Conflict'];
  }
}
