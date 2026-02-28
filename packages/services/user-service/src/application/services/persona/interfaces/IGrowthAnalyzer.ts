/**
 * Growth Analyzer Interface
 */

import type { PersonaAnalysisInput, GrowthData, PersonalityData, BehaviorData, CognitiveData } from '../types';

export interface IGrowthAnalyzer {
  analyze(
    input: PersonaAnalysisInput,
    personality: PersonalityData,
    behavior: BehaviorData,
    cognitive: CognitiveData
  ): Promise<GrowthData>;
}
