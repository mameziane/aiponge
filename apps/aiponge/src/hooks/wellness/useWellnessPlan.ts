/**
 * Wellness Plan Hook
 * React Query mutation for POST /api/app/wellness/plan
 */

import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '../../lib/axiosApiClient';

export interface WellnessPlanRequest {
  transcript: string;
  recipientId: string | null;
  sessionId?: string | null;
}

export interface WellnessInterpretation {
  summary: string;
  detectedRecipientName: string | null;
  emotionalState: string;
  coreNeeds: string[];
}

export interface WellnessBookPlan {
  bookTypeId: string;
  bookTypeName: string;
  suggestedTitle: string;
  chapterCount: number;
  chapterThemes: string[];
}

export interface WellnessAlbumPlan {
  suggestedTitle: string;
  trackCount: number;
  genres: string[];
  mood: string;
  style: string;
  moodProgression?: string;
  basedOnPreferences?: boolean;
}

export interface WellnessFirstTrackPlan {
  prompt: string;
  mood: string;
  genre: string;
  style: string;
}

export interface WellnessMember {
  id: string;
  name: string;
  relationship: 'self' | 'member';
}

export interface WellnessRecipient {
  id: string;
  name: string;
  relationship: 'self' | 'member';
  visibility: 'personal' | 'shared' | 'public';
}

export interface WellnessPlanResponse {
  sessionId: string;
  interpretation: WellnessInterpretation;
  recipient: WellnessRecipient;
  plan: {
    book: WellnessBookPlan;
    album: WellnessAlbumPlan;
    firstTrack?: WellnessFirstTrackPlan;
  };
  membersList: WellnessMember[];
}

export function useWellnessPlan() {
  const mutation = useMutation({
    mutationFn: async (request: WellnessPlanRequest) => {
      const response = await apiRequest<WellnessPlanResponse>('/api/v1/app/wellness/plan', {
        method: 'POST',
        data: request,
      });
      return response;
    },
  });

  return {
    plan: mutation.mutate,
    planAsync: mutation.mutateAsync,
    data: mutation.data,
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
