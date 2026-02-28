/**
 * Psychological Framework Domain Entity
 */

export type FrameworkCategory =
  | 'cognitive'
  | 'behavioral'
  | 'humanistic'
  | 'psychodynamic'
  | 'integrative'
  | 'somatic'
  | 'mindfulness'
  | 'positive'
  | 'existential';

export interface PsychologicalFramework {
  id: string;
  name: string;
  shortName: string;
  category: FrameworkCategory;
  description: string;
  keyPrinciples: string[];
  therapeuticGoals: string[];
  triggerPatterns: string[];
  songStructureHint: string | null;
  isEnabled: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FrameworkFilter {
  category?: FrameworkCategory;
  isEnabled?: boolean;
}
