/**
 * Cognitive Analyzer Interface
 */

import type { PersonaAnalysisInput, CognitiveData, PersonalizationDepth } from '../types';

export interface ICognitiveAnalyzer {
  analyze(input: PersonaAnalysisInput, depth: PersonalizationDepth): Promise<CognitiveData>;
}
