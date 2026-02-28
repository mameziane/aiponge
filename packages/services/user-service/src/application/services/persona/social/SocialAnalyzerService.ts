/**
 * Social Analyzer Service
 * Analyzes relationship style, social needs, and communication preferences
 */

import type { ISocialAnalyzer } from '../interfaces/ISocialAnalyzer';
import type { PersonaAnalysisInput, SocialData, PersonalizationDepth, EntryItem } from '../types';

export class SocialAnalyzerService implements ISocialAnalyzer {
  async analyze(input: PersonaAnalysisInput, _depth: PersonalizationDepth): Promise<SocialData> {
    const { entries } = input;

    const relationshipStyle = this.analyzeRelationshipStyle(entries);
    const socialNeeds = this.extractSocialNeeds(entries);
    const communicationPreferences = this.extractCommunicationPreferences(entries);

    return {
      relationshipStyle,
      socialNeeds,
      communicationPreferences,
    };
  }

  private analyzeRelationshipStyle(entries: EntryItem[]): string {
    const supportiveCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('support') ||
        t.content.toLowerCase().includes('help') ||
        t.content.toLowerCase().includes('care')
    ).length;

    const collaborativeCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('together') ||
        t.content.toLowerCase().includes('team') ||
        t.content.toLowerCase().includes('collaborate')
    ).length;

    const independentCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('alone') ||
        t.content.toLowerCase().includes('independent') ||
        t.content.toLowerCase().includes('myself')
    ).length;

    if (supportiveCues >= collaborativeCues && supportiveCues >= independentCues) {
      return 'Supportive and nurturing';
    }
    if (collaborativeCues >= supportiveCues && collaborativeCues >= independentCues) {
      return 'Collaborative and team-oriented';
    }
    if (independentCues > supportiveCues && independentCues > collaborativeCues) {
      return 'Independent with selective connections';
    }
    return 'Supportive and collaborative';
  }

  private extractSocialNeeds(entries: EntryItem[]): string[] {
    const needs: string[] = [];
    const content = entries.map(t => t.content.toLowerCase()).join(' ');

    if (content.includes('connect') || content.includes('belong') || content.includes('together')) {
      needs.push('Connection');
    }
    if (content.includes('understand') || content.includes('listen') || content.includes('hear')) {
      needs.push('Understanding');
    }
    if (content.includes('support') || content.includes('help') || content.includes('there for')) {
      needs.push('Support');
    }
    if (content.includes('respect') || content.includes('value') || content.includes('appreciate')) {
      needs.push('Respect');
    }
    if (content.includes('space') || content.includes('alone') || content.includes('privacy')) {
      needs.push('Personal space');
    }

    return needs.length > 0 ? needs : ['Connection', 'Understanding', 'Support'];
  }

  private extractCommunicationPreferences(entries: EntryItem[]): string[] {
    const preferences: string[] = [];
    const content = entries.map(t => t.content.toLowerCase()).join(' ');

    if (content.includes('direct') || content.includes('straightforward') || content.includes('honest')) {
      preferences.push('Direct communication');
    }
    if (content.includes('listen') || content.includes('hear') || content.includes('understand')) {
      preferences.push('Active listening');
    }
    if (content.includes('empathy') || content.includes('feel') || content.includes('compassion')) {
      preferences.push('Empathetic responses');
    }
    if (content.includes('written') || content.includes('write') || content.includes('text')) {
      preferences.push('Written communication');
    }
    if (content.includes('face to face') || content.includes('in person') || content.includes('meet')) {
      preferences.push('Face-to-face interaction');
    }

    return preferences.length > 0 ? preferences : ['Direct communication', 'Active listening', 'Empathetic responses'];
  }
}
