/**
 * Social Analyzer Interface
 */

import type { PersonaAnalysisInput, SocialData, PersonalizationDepth } from '../types';

export interface ISocialAnalyzer {
  analyze(input: PersonaAnalysisInput, depth: PersonalizationDepth): Promise<SocialData>;
}
