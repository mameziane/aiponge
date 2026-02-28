/**
 * Personality Analyzer Service
 * Extracts Big Five personality traits and emotional profile from user data
 */

import type { IPersonalityAnalyzer } from '../interfaces/IPersonalityAnalyzer';
import type {
  PersonaAnalysisInput,
  PersonalityData,
  PersonalizationDepth,
  EntryItem,
  InsightEntry,
  PersonalityTrait,
  TraitAnalysis,
  EmotionalProfile,
} from '../types';

export class PersonalityAnalyzerService implements IPersonalityAnalyzer {
  async analyze(input: PersonaAnalysisInput, depth: PersonalizationDepth): Promise<PersonalityData> {
    const { entries, insights } = input;

    const primaryTraits = await this.extractPrimaryTraits(entries, insights);
    const secondaryTraits = await this.extractSecondaryTraits(entries, insights);
    const personalityType = this.determinePersonalityType(primaryTraits, secondaryTraits);
    const cognitiveStyle = this.determineCognitiveStyle(entries, insights);
    const emotionalProfile = this.analyzeEmotionalProfile(entries, insights);

    return {
      primaryTraits,
      secondaryTraits,
      personalityType,
      cognitiveStyle,
      emotionalProfile,
    };
  }

  private async extractPrimaryTraits(entries: EntryItem[], insights: InsightEntry[]): Promise<PersonalityTrait[]> {
    const traits: PersonalityTrait[] = [];

    const openness = this.analyzeOpenness(entries, insights);
    traits.push({
      trait: 'Openness to Experience',
      score: openness.score,
      confidence: openness.confidence,
      description: openness.description,
      evidence: openness.evidence,
    });

    const conscientiousness = this.analyzeConscientiousness(entries, insights);
    traits.push({
      trait: 'Conscientiousness',
      score: conscientiousness.score,
      confidence: conscientiousness.confidence,
      description: conscientiousness.description,
      evidence: conscientiousness.evidence,
    });

    const extraversion = this.analyzeExtraversion(entries, insights);
    traits.push({
      trait: 'Extraversion',
      score: extraversion.score,
      confidence: extraversion.confidence,
      description: extraversion.description,
      evidence: extraversion.evidence,
    });

    const agreeableness = this.analyzeAgreeableness(entries, insights);
    traits.push({
      trait: 'Agreeableness',
      score: agreeableness.score,
      confidence: agreeableness.confidence,
      description: agreeableness.description,
      evidence: agreeableness.evidence,
    });

    const neuroticism = this.analyzeNeuroticism(entries, insights);
    traits.push({
      trait: 'Emotional Stability',
      score: 1 - neuroticism.score,
      confidence: neuroticism.confidence,
      description: this.getEmotionalStabilityDescription(1 - neuroticism.score),
      evidence: neuroticism.evidence,
    });

    return traits;
  }

  private async extractSecondaryTraits(entries: EntryItem[], insights: InsightEntry[]): Promise<PersonalityTrait[]> {
    const traits: PersonalityTrait[] = [];

    const resilience = this.analyzeResilience(entries, insights);
    traits.push({
      trait: 'Resilience',
      score: resilience.score,
      confidence: resilience.confidence,
      description: resilience.description,
      evidence: resilience.evidence,
    });

    const creativity = this.analyzeCreativity(entries, insights);
    traits.push({
      trait: 'Creativity',
      score: creativity.score,
      confidence: creativity.confidence,
      description: creativity.description,
      evidence: creativity.evidence,
    });

    return traits;
  }

  private analyzeOpenness(entries: EntryItem[], _insights: InsightEntry[]): TraitAnalysis {
    const opennessCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('wonder') ||
        t.content.toLowerCase().includes('curious') ||
        t.content.toLowerCase().includes('explore') ||
        (t.tags ?? []).some((tag: string) =>
          ['learning', 'art', 'philosophy', 'creativity'].includes(tag.toLowerCase())
        )
    );

    const score = Math.min(1.0, opennessCues.length / Math.max(entries.length * 0.3, 1));

    return {
      score,
      confidence: entries.length > 20 ? 0.8 : 0.6,
      description: this.getOpennessDescription(score),
      evidence: opennessCues.slice(0, 3).map(t => `"${t.content.substring(0, 100)}..."`),
    };
  }

  private analyzeConscientiousness(entries: EntryItem[], _insights: InsightEntry[]): TraitAnalysis {
    const conscientiousnessCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('plan') ||
        t.content.toLowerCase().includes('goal') ||
        t.content.toLowerCase().includes('organize') ||
        (t.tags ?? []).some((tag: string) =>
          ['planning', 'goals', 'productivity', 'discipline'].includes(tag.toLowerCase())
        )
    );

    const score = Math.min(1.0, conscientiousnessCues.length / Math.max(entries.length * 0.25, 1));

    return {
      score,
      confidence: entries.length > 15 ? 0.7 : 0.5,
      description: this.getConscientiousnessDescription(score),
      evidence: conscientiousnessCues.slice(0, 3).map(t => `"${t.content.substring(0, 100)}..."`),
    };
  }

  private analyzeExtraversion(entries: EntryItem[], _insights: InsightEntry[]): TraitAnalysis {
    const extraversionCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('people') ||
        t.content.toLowerCase().includes('social') ||
        t.content.toLowerCase().includes('friends') ||
        (t.tags ?? []).some((tag: string) =>
          ['social', 'relationships', 'networking', 'collaboration'].includes(tag.toLowerCase())
        )
    );

    const score = Math.min(1.0, extraversionCues.length / Math.max(entries.length * 0.2, 1));

    return {
      score,
      confidence: entries.length > 25 ? 0.7 : 0.5,
      description: this.getExtraversionDescription(score),
      evidence: extraversionCues.slice(0, 3).map(t => `"${t.content.substring(0, 100)}..."`),
    };
  }

  private analyzeAgreeableness(entries: EntryItem[], _insights: InsightEntry[]): TraitAnalysis {
    const agreeablenessCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('help') ||
        t.content.toLowerCase().includes('understand') ||
        t.content.toLowerCase().includes('empathy') ||
        (t.tags ?? []).some((tag: string) =>
          ['empathy', 'helping', 'compassion', 'cooperation'].includes(tag.toLowerCase())
        )
    );

    const score = Math.min(1.0, agreeablenessCues.length / Math.max(entries.length * 0.2, 1));

    return {
      score,
      confidence: entries.length > 20 ? 0.7 : 0.5,
      description: this.getAgreeablenessDescription(score),
      evidence: agreeablenessCues.slice(0, 3).map(t => `"${t.content.substring(0, 100)}..."`),
    };
  }

  private analyzeNeuroticism(entries: EntryItem[], _insights: InsightEntry[]): TraitAnalysis {
    const neuroticismCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('anxious') ||
        t.content.toLowerCase().includes('worry') ||
        t.content.toLowerCase().includes('stress') ||
        (t.tags ?? []).some((tag: string) => ['anxiety', 'stress', 'worry', 'negative'].includes(tag.toLowerCase())) ||
        (t.sentiment && t.sentiment === 'negative')
    );

    const score = Math.min(1.0, neuroticismCues.length / Math.max(entries.length * 0.15, 1));

    return {
      score,
      confidence: entries.length > 30 ? 0.8 : 0.6,
      description: this.getNeuroticismDescription(score),
      evidence: neuroticismCues.slice(0, 3).map(t => `"${t.content.substring(0, 100)}..."`),
    };
  }

  private analyzeResilience(entries: EntryItem[], _insights: InsightEntry[]): TraitAnalysis {
    const resilienceCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('overcome') ||
        t.content.toLowerCase().includes('persist') ||
        t.content.toLowerCase().includes('learn from') ||
        (t.tags ?? []).some((tag: string) =>
          ['resilience', 'growth', 'perseverance', 'recovery'].includes(tag.toLowerCase())
        )
    );

    const score = Math.min(1.0, resilienceCues.length / Math.max(entries.length * 0.15, 1));

    return {
      score,
      confidence: entries.length > 25 ? 0.7 : 0.5,
      description: this.getResilienceDescription(score),
      evidence: resilienceCues.slice(0, 3).map(t => `"${t.content.substring(0, 100)}..."`),
    };
  }

  private analyzeCreativity(entries: EntryItem[], _insights: InsightEntry[]): TraitAnalysis {
    const creativityCues = entries.filter(
      t =>
        t.content.toLowerCase().includes('creative') ||
        t.content.toLowerCase().includes('innovative') ||
        t.content.toLowerCase().includes('imagine') ||
        t.type === 'poem' ||
        t.type === 'story' ||
        (t.tags ?? []).some((tag: string) =>
          ['creativity', 'art', 'innovation', 'imagination'].includes(tag.toLowerCase())
        )
    );

    const score = Math.min(1.0, creativityCues.length / Math.max(entries.length * 0.2, 1));

    return {
      score,
      confidence: entries.length > 20 ? 0.7 : 0.5,
      description: this.getCreativityDescription(score),
      evidence: creativityCues.slice(0, 3).map(t => `"${t.content.substring(0, 100)}..."`),
    };
  }

  private determinePersonalityType(primaryTraits: PersonalityTrait[], _secondaryTraits: PersonalityTrait[]): string {
    const openness = primaryTraits.find(t => t.trait === 'Openness to Experience')?.score || 0.5;
    const conscientiousness = primaryTraits.find(t => t.trait === 'Conscientiousness')?.score || 0.5;
    const extraversion = primaryTraits.find(t => t.trait === 'Extraversion')?.score || 0.5;
    const agreeableness = primaryTraits.find(t => t.trait === 'Agreeableness')?.score || 0.5;
    const emotionalStability = primaryTraits.find(t => t.trait === 'Emotional Stability')?.score || 0.5;

    if (openness > 0.7 && conscientiousness > 0.7) return 'Innovative Achiever';
    if (extraversion > 0.7 && agreeableness > 0.7) return 'Social Connector';
    if (conscientiousness > 0.7 && emotionalStability > 0.7) return 'Steady Performer';
    if (openness > 0.7 && extraversion > 0.7) return 'Creative Explorer';
    if (agreeableness > 0.7 && emotionalStability > 0.7) return 'Harmonious Supporter';
    if (conscientiousness > 0.7 && extraversion > 0.7) return 'Dynamic Organizer';
    if (openness > 0.7 && agreeableness > 0.7) return 'Empathetic Innovator';

    return 'Balanced Individual';
  }

  private determineCognitiveStyle(entries: EntryItem[], _insights: InsightEntry[]): string {
    const analyticalEntries = entries.filter(
      t =>
        t.content.toLowerCase().includes('analyze') ||
        t.content.toLowerCase().includes('logical') ||
        t.content.toLowerCase().includes('reason')
    );

    const intuitiveEntries = entries.filter(
      t =>
        t.content.toLowerCase().includes('feel') ||
        t.content.toLowerCase().includes('intuition') ||
        t.content.toLowerCase().includes('gut')
    );

    const creativeEntries = entries.filter(
      t =>
        t.type === 'poem' ||
        t.type === 'story' ||
        t.content.toLowerCase().includes('creative') ||
        t.content.toLowerCase().includes('imagine')
    );

    if (analyticalEntries.length > intuitiveEntries.length && analyticalEntries.length > creativeEntries.length) {
      return 'Analytical Thinker';
    } else if (intuitiveEntries.length > creativeEntries.length) {
      return 'Intuitive Thinker';
    } else if (creativeEntries.length > 0) {
      return 'Creative Thinker';
    }

    return 'Balanced Thinker';
  }

  private analyzeEmotionalProfile(entries: EntryItem[], insights: InsightEntry[]): EmotionalProfile {
    const emotionalWords = entries.reduce((acc: Record<string, number>, entry) => {
      const emotions = this.extractEmotionalWords(entry.content);
      emotions.forEach(emotion => {
        acc[emotion] = (acc[emotion] || 0) + 1;
      });
      return acc;
    }, {});

    const dominantEmotions = Object.entries(emotionalWords)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 5)
      .map(([emotion]) => emotion);

    const emotionalRange = this.calculateEmotionalRange(entries);
    const emotionalStability = this.calculateEmotionalStability(entries);
    const resilience = this.calculateResilience(entries, insights);

    return {
      dominantEmotions,
      emotionalRange,
      emotionalStability,
      resilience,
    };
  }

  private extractEmotionalWords(content: string): string[] {
    const emotionalWords = [
      'happy',
      'sad',
      'angry',
      'excited',
      'anxious',
      'calm',
      'frustrated',
      'grateful',
      'disappointed',
      'hopeful',
      'fearful',
      'confident',
      'worried',
      'peaceful',
      'stressed',
      'joyful',
      'content',
      'overwhelmed',
      'motivated',
    ];

    const words = content.toLowerCase().split(/\W+/);
    return emotionalWords.filter(emotion => words.includes(emotion));
  }

  private calculateEmotionalRange(entries: EntryItem[]): number {
    const uniqueEmotions = new Set<string>();
    entries.forEach(entry => {
      this.extractEmotionalWords(entry.content).forEach(emotion => uniqueEmotions.add(emotion));
    });
    return Math.min(1.0, uniqueEmotions.size / 10);
  }

  private calculateEmotionalStability(_entries: EntryItem[]): number {
    return 0.7;
  }

  private calculateResilience(entries: EntryItem[], _insights: InsightEntry[]): number {
    const resilienceIndicators = entries.filter(
      t =>
        t.content.toLowerCase().includes('overcome') ||
        t.content.toLowerCase().includes('learn') ||
        t.content.toLowerCase().includes('grow')
    );
    return Math.min(1.0, resilienceIndicators.length / Math.max(entries.length * 0.1, 1));
  }

  private getOpennessDescription(score: number): string {
    if (score > 0.7) return 'Highly open to new experiences, curious and imaginative';
    if (score > 0.4) return 'Moderately open to new experiences with balanced curiosity';
    return 'Prefers familiar experiences with practical focus';
  }

  private getConscientiousnessDescription(score: number): string {
    if (score > 0.7) return 'Highly organized, goal-oriented, and disciplined';
    if (score > 0.4) return 'Moderately organized with balanced planning approach';
    return 'Flexible and spontaneous with adaptable planning style';
  }

  private getExtraversionDescription(score: number): string {
    if (score > 0.7) return 'Outgoing, energetic, and socially oriented';
    if (score > 0.4) return 'Balanced social energy with situational preferences';
    return 'Quiet, reserved, and inwardly focused';
  }

  private getAgreeablenessDescription(score: number): string {
    if (score > 0.7) return 'Highly cooperative, trusting, and empathetic';
    if (score > 0.4) return 'Balanced cooperation with healthy skepticism';
    return 'Independent-minded with direct communication style';
  }

  private getEmotionalStabilityDescription(score: number): string {
    if (score > 0.7) return 'Emotionally stable, calm under pressure';
    if (score > 0.4) return 'Generally stable with normal emotional responses';
    return 'Emotionally sensitive with heightened stress responses';
  }

  private getNeuroticismDescription(score: number): string {
    if (score > 0.7) return 'Prone to anxiety and emotional reactivity';
    if (score > 0.4) return 'Normal emotional responses with occasional stress';
    return 'Emotionally stable and calm';
  }

  private getResilienceDescription(score: number): string {
    if (score > 0.7) return 'Highly resilient with strong recovery abilities';
    if (score > 0.4) return 'Moderately resilient with good coping skills';
    return 'Developing resilience with room for growth';
  }

  private getCreativityDescription(score: number): string {
    if (score > 0.7) return 'Highly creative with innovative thinking';
    if (score > 0.4) return 'Moderately creative with occasional innovation';
    return 'Practical thinker with conventional approaches';
  }
}
