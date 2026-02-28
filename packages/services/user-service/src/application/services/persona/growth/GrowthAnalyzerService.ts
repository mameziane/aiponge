/**
 * Growth Analyzer Service
 * Identifies development areas, strengths, and potential growth paths
 */

import type { IGrowthAnalyzer } from '../interfaces/IGrowthAnalyzer';
import type {
  PersonaAnalysisInput,
  GrowthData,
  PersonalityData,
  BehaviorData,
  CognitiveData,
  PersonalityTrait,
} from '../types';

export class GrowthAnalyzerService implements IGrowthAnalyzer {
  async analyze(
    input: PersonaAnalysisInput,
    personality: PersonalityData,
    behavior: BehaviorData,
    cognitive: CognitiveData
  ): Promise<GrowthData> {
    const { insights } = input;

    const developmentAreas = insights
      .filter(insight => insight.type === 'recommendation' && insight.actionable)
      .map(insight =>
        typeof insight.content === 'object' && insight.content?.title ? insight.content.title : String(insight.content)
      )
      .slice(0, 5);

    const strengths = this.extractStrengths(personality, behavior, cognitive);
    const potentialGrowthPaths = this.generateGrowthPaths(personality, behavior, cognitive, developmentAreas);

    return {
      developmentAreas: developmentAreas.length > 0 ? developmentAreas : this.getDefaultDevelopmentAreas(personality),
      strengths,
      potentialGrowthPaths,
    };
  }

  private extractStrengths(personality: PersonalityData, behavior: BehaviorData, cognitive: CognitiveData): string[] {
    const strengths: string[] = [];

    personality.primaryTraits.forEach((trait: PersonalityTrait) => {
      if (trait.score > 0.7) {
        strengths.push(trait.trait);
      }
    });

    personality.secondaryTraits.forEach((trait: PersonalityTrait) => {
      if (trait.score > 0.7) {
        strengths.push(trait.trait);
      }
    });

    if (cognitive.creativity > 0.7) {
      strengths.push('Creative thinking');
    }
    if (cognitive.analyticalThinking > 0.7) {
      strengths.push('Analytical thinking');
    }

    if (behavior.patterns.some(p => p.strength > 0.7)) {
      strengths.push('Strong behavioral patterns');
    }

    return strengths.slice(0, 5);
  }

  private generateGrowthPaths(
    personality: PersonalityData,
    behavior: BehaviorData,
    cognitive: CognitiveData,
    developmentAreas: string[]
  ): string[] {
    const paths: string[] = [];

    const lowTraits = personality.primaryTraits.filter(t => t.score < 0.4);
    lowTraits.forEach(trait => {
      if (trait.trait === 'Openness to Experience') {
        paths.push('Expand comfort zone through new experiences');
      }
      if (trait.trait === 'Conscientiousness') {
        paths.push('Develop goal-setting and organizational habits');
      }
      if (trait.trait === 'Extraversion') {
        paths.push('Build social confidence through gradual exposure');
      }
      if (trait.trait === 'Agreeableness') {
        paths.push('Practice empathy and active listening');
      }
      if (trait.trait === 'Emotional Stability') {
        paths.push('Develop emotional regulation techniques');
      }
    });

    if (cognitive.creativity < 0.5) {
      paths.push('Creative problem-solving skill building');
    }
    if (cognitive.analyticalThinking < 0.5) {
      paths.push('Analytical and critical thinking development');
    }

    paths.push('Leadership development through enhanced communication');
    paths.push('Strategic thinking development');

    return paths.slice(0, 4);
  }

  private getDefaultDevelopmentAreas(personality: PersonalityData): string[] {
    const areas: string[] = [];
    const lowTraits = personality.primaryTraits.filter(t => t.score < 0.5);

    lowTraits.forEach(trait => {
      areas.push(`Develop ${trait.trait.toLowerCase()}`);
    });

    if (areas.length === 0) {
      areas.push('Continuous personal growth');
      areas.push('Skill diversification');
    }

    return areas.slice(0, 3);
  }
}
