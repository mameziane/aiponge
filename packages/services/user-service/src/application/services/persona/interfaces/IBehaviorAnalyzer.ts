/**
 * Behavior Analyzer Interface
 */

import type { PersonaAnalysisInput, BehaviorData, PersonalizationDepth } from '../types';

export interface IBehaviorAnalyzer {
  analyze(input: PersonaAnalysisInput, depth: PersonalizationDepth): Promise<BehaviorData>;
}
