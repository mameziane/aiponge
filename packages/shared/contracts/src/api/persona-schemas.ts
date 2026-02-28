import { z } from 'zod';

export const PersonalityTraitSchema = z.object({
  trait: z.string(),
  score: z.number(),
});
export type PersonalityTrait = z.infer<typeof PersonalityTraitSchema>;

export const EmotionalProfileSchema = z.object({
  dominantEmotions: z.array(z.string()),
  emotionalRange: z.number(),
  emotionalStability: z.number(),
  resilience: z.number(),
});
export type EmotionalProfile = z.infer<typeof EmotionalProfileSchema>;

export const PersonalityDataSchema = z.object({
  primaryTraits: z.array(PersonalityTraitSchema),
  secondaryTraits: z.array(PersonalityTraitSchema),
  personalityType: z.string(),
  cognitiveStyle: z.string(),
  emotionalProfile: EmotionalProfileSchema,
});
export type PersonalityData = z.infer<typeof PersonalityDataSchema>;

export const BehaviorPatternSchema = z.object({
  pattern: z.string(),
  frequency: z.number(),
  strength: z.number(),
  trend: z.string(),
});
export type BehaviorPattern = z.infer<typeof BehaviorPatternSchema>;

export const BehaviorPreferencesSchema = z.object({
  communicationStyle: z.string(),
  learningStyle: z.string(),
  decisionMaking: z.string(),
  conflictResolution: z.string(),
});
export type BehaviorPreferences = z.infer<typeof BehaviorPreferencesSchema>;

export const BehaviorDataSchema = z.object({
  patterns: z.array(BehaviorPatternSchema),
  preferences: BehaviorPreferencesSchema,
  motivators: z.array(z.string()),
  stressors: z.array(z.string()),
});
export type BehaviorData = z.infer<typeof BehaviorDataSchema>;

export const CognitiveDataSchema = z.object({
  thinkingPatterns: z.array(z.string()),
  problemSolvingStyle: z.string(),
  creativity: z.number(),
  analyticalThinking: z.number(),
  intuitiveThinkers: z.number(),
});
export type CognitiveData = z.infer<typeof CognitiveDataSchema>;

export const SocialDataSchema = z.object({
  relationshipStyle: z.string(),
  socialNeeds: z.array(z.string()),
  communicationPreferences: z.array(z.string()),
});
export type SocialData = z.infer<typeof SocialDataSchema>;

export const GrowthDataSchema = z.object({
  developmentAreas: z.array(z.string()),
  strengths: z.array(z.string()),
  potentialGrowthPaths: z.array(z.string()),
});
export type GrowthData = z.infer<typeof GrowthDataSchema>;

export const UserPersonaSchema = z.object({
  id: z.string(),
  userId: z.string(),
  personaName: z.string(),
  personaDescription: z.string().nullable().optional(),
  personality: PersonalityDataSchema,
  behavior: BehaviorDataSchema,
  cognitive: CognitiveDataSchema,
  social: SocialDataSchema,
  growth: GrowthDataSchema,
  confidence: z.number(),
  dataPoints: z.number(),
  version: z.string(),
  isActive: z.boolean(),
  generatedAt: z.string(),
  updatedAt: z.string(),
});
export type UserPersona = z.infer<typeof UserPersonaSchema>;

export const UserPersonaResponseSchema = z.object({
  success: z.boolean(),
  persona: UserPersonaSchema.nullable(),
  generatedAt: z.string().optional(),
  error: z.string().optional(),
});
export type UserPersonaResponse = z.infer<typeof UserPersonaResponseSchema>;
