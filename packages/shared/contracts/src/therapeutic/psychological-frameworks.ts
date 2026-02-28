/**
 * Shared Psychological Frameworks Type Definitions
 * Used by ai-content-service and music-service for therapeutic analysis
 *
 * NOTE: Framework data is now stored in the database (cfg_psychological_frameworks table)
 * and served via ai-config-service API at /api/frameworks
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
  enabled: boolean;
  songStructureHint?: string;
}

export interface FrameworkMatch {
  framework: PsychologicalFramework;
  score: number;
  matchedPatterns: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface FrameworkSelectionResult {
  primaryFramework: FrameworkMatch | null;
  supportingFrameworks: FrameworkMatch[];
  detectedEmotions: string[];
  detectedThemes: string[];
  therapeuticApproach: string;
  songStructureGuidance: string;
}

export interface FrameworkMetadata {
  id: string;
  name: string;
  shortName: string;
  keyPrinciples: string[];
  therapeuticGoals: string[];
  songStructureHint?: string;
  confidence: 'high' | 'medium' | 'low';
  matchedPatterns?: string[];
}

export const FRAMEWORK_CATEGORIES = [
  { id: 'cognitive', name: 'Cognitive', color: '#4A90D9' },
  { id: 'behavioral', name: 'Behavioral', color: '#7CB342' },
  { id: 'humanistic', name: 'Humanistic', color: '#FF7043' },
  { id: 'psychodynamic', name: 'Psychodynamic', color: '#AB47BC' },
  { id: 'integrative', name: 'Integrative', color: '#26A69A' },
  { id: 'somatic', name: 'Somatic', color: '#EC407A' },
  { id: 'mindfulness', name: 'Mindfulness', color: '#5C6BC0' },
  { id: 'positive', name: 'Positive Psychology', color: '#FFA726' },
  { id: 'existential', name: 'Existential', color: '#8D6E63' },
] as const;

export const EMOTION_PATTERNS = {
  sadness: /\b(sad|depressed|down|hopeless|empty|crying|tears|grief|loss|lonely)\b/i,
  anxiety: /\b(anxious|worried|nervous|scared|fear|panic|stress|overwhelm|tense)\b/i,
  anger: /\b(angry|frustrated|irritated|rage|resentment|annoyed|mad|furious)\b/i,
  joy: /\b(happy|joyful|excited|grateful|thankful|blessed|content|peaceful|love)\b/i,
  shame: /\b(shame|ashamed|embarrassed|guilty|worthless|failure|inadequate)\b/i,
  confusion: /\b(confused|lost|uncertain|stuck|don't know|unclear|torn)\b/i,
};

export const THEME_PATTERNS = {
  relationships: /\b(relationship|partner|friend|family|parent|child|marriage|divorce|breakup)\b/i,
  work: /\b(work|job|career|boss|colleague|workplace|professional|business)\b/i,
  identity: /\b(identity|who am I|self|purpose|meaning|authentic|true self)\b/i,
  trauma: /\b(trauma|abuse|ptsd|flashback|triggered|past|childhood|memory)\b/i,
  change: /\b(change|transition|new|different|growth|moving|starting|ending)\b/i,
  health: /\b(health|illness|sick|body|physical|medical|diagnosis)\b/i,
};

export function getCategoryColor(category: string): string {
  return FRAMEWORK_CATEGORIES.find(c => c.id === category)?.color ?? '#888888';
}
