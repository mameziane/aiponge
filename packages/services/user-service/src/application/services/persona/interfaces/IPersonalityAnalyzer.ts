/**
 * Personality Analyzer Interface
 */

import type { PersonaAnalysisInput, PersonalityData, PersonalizationDepth } from '../types';

export interface IPersonalityAnalyzer {
  analyze(input: PersonaAnalysisInput, depth: PersonalizationDepth): Promise<PersonalityData>;
}
