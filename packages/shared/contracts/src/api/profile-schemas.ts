import { z } from 'zod';
import { ServiceResponseSchema } from '../common/index.js';
import type { ServiceResponse } from '../common/index.js';

export const ProfileSchema = z.object({
  userId: z.string(),
  name: z.string().optional(),
  displayName: z.string().optional(),
  birthdate: z.string().optional(),
  avatarUrl: z.string().optional(),
  languagePreference: z.string().optional(),
  onboardingCompleted: z.boolean().optional(),
});
export type Profile = z.infer<typeof ProfileSchema>;

export type ProfileResponse = ServiceResponse<Profile>;

export const ProfileResponseSchema = ServiceResponseSchema(ProfileSchema);

export const UserPreferencesDataSchema = z.object({
  preferences: z
    .object({
      currentMood: z.string().optional(),
      languagePreference: z.string().optional(),
      wellnessIntention: z.string().optional(),
    })
    .optional(),
  profile: z
    .object({
      displayName: z.string().optional(),
      name: z.string().optional(),
    })
    .optional(),
});
export type UserPreferencesData = z.infer<typeof UserPreferencesDataSchema>;
export const UserPreferencesResponseSchema = ServiceResponseSchema(UserPreferencesDataSchema);
export type UserPreferencesResponse = ServiceResponse<UserPreferencesData>;

export const SavedLyricsDataSchema = z.object({
  id: z.string(),
  content: z.string().optional(),
});
export type SavedLyricsData = z.infer<typeof SavedLyricsDataSchema>;
export const SavedLyricsResponseSchema = ServiceResponseSchema(SavedLyricsDataSchema);
export type SavedLyricsResponse = ServiceResponse<SavedLyricsData>;
