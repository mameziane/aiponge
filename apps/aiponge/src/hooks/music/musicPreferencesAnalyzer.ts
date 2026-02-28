/**
 * Music Preferences Analyzer - AI-powered extraction of music styles/genres
 * Analyzes free-text user music preferences to extract structured parameters
 *
 * NOTE: All AI prompt construction is handled server-side for security and maintainability.
 * The frontend simply calls the backend endpoint with the raw preferences.
 */

import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import type { ServiceResponse } from '@aiponge/shared-contracts';

type AnalyzePreferencesResponse = ServiceResponse<MusicPreferencesAnalysis>;

export interface MusicPreferencesAnalysis {
  styles?: string[];
  genres?: string[];
  moods?: string[];
  instruments?: string[];
  excludedStyles?: string[];
  culturalStyles?: string[];
  rawPreferences: string;
}

/**
 * Analyze user's free-text music preferences using AI
 * Returns structured data for music generation
 * Note: userId is automatically extracted from JWT token by backend
 */
export async function analyzeMusicPreferences(musicPreferences: string): Promise<MusicPreferencesAnalysis> {
  const emptyResult: MusicPreferencesAnalysis = {
    rawPreferences: '',
    styles: [],
    genres: [],
    moods: [],
    instruments: [],
    excludedStyles: [],
    culturalStyles: [],
  };

  if (!musicPreferences || musicPreferences.trim().length === 0) {
    return emptyResult;
  }

  try {
    const response = await apiClient.post<AnalyzePreferencesResponse>('/api/v1/app/music/analyze-preferences', {
      musicPreferences,
    });

    if (response?.success && response?.data) {
      return response.data;
    }

    const errorMessage = response?.error?.message || 'Music preferences analysis failed';
    logger.error('Music preferences analysis failed', { message: errorMessage });
    throw new Error(errorMessage);
  } catch (error) {
    logger.error('Error analyzing music preferences', error);
    throw error;
  }
}
