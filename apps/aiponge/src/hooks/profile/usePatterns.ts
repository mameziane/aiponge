/**
 * usePatterns Hook
 * Fetches and manages user pattern recognition data
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/axiosApiClient';
import { useAuthStore, selectUser } from '../../auth/store';
import { useToast } from '../ui/use-toast';
import { useTranslation } from '../../i18n';
import { logger } from '../../lib/logger';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';

export interface PatternInsight {
  patternType: 'emotional' | 'temporal' | 'thematic' | 'behavioral';
  patternName: string;
  description: string;
  frequency: number;
  strength: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  relatedThemes: string[];
  triggerFactors: string[];
}

export interface UserPattern {
  id: string;
  userId: string;
  patternType: string;
  patternName: string;
  description: string;
  frequency: number;
  strength: string;
  trend: string;
  relatedThemes: string[];
  triggerFactors: string[];
  firstObserved: string;
  lastObserved: string;
  isActive: boolean;
}

export interface ThemeFrequency {
  id: string;
  userId: string;
  theme: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
}

export interface PatternInsightsData {
  summary: {
    totalPatterns: number;
    emotionalPatternCount: number;
    temporalPatternCount: number;
    thematicPatternCount: number;
    totalThemesTracked: number;
  };
  emotional: {
    dominantMoods: Array<{
      mood: string;
      strength: string;
      trend: string;
      description: string;
    }>;
  };
  temporal: {
    peakTimes: Array<{
      time: string;
      frequency: number;
      description: string;
    }>;
  };
  thematic: {
    focusAreas: Array<{
      theme: string;
      strength: string;
      relatedThemes: string[];
      description: string;
    }>;
  };
  themes: {
    topThemes: Array<{
      theme: string;
      frequency: number;
    }>;
  };
}

type PatternsResponse = ServiceResponse<{
  userId: string;
  patterns: UserPattern[];
  count: number;
}>;

type InsightsResponse = ServiceResponse<{
  userId: string;
  insights: PatternInsightsData;
  generatedAt: string;
}>;

type ThemesResponse = ServiceResponse<{
  userId: string;
  themes: ThemeFrequency[];
  count: number;
  topThemes: Array<{
    theme: string;
    count: number;
    firstSeen: string;
    lastSeen: string;
  }>;
}>;

type AnalyzeResponse = ServiceResponse<{
  userId: string;
  patterns: PatternInsight[];
  analyzedAt: string;
  patternCount: number;
}>;

export function usePatterns() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore(selectUser);

  const patternsQuery = useQuery<PatternsResponse>({
    queryKey: ['patterns', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      logger.debug('Fetching user patterns', { userId: user.id });
      const response = await apiClient.get<PatternsResponse>(`/api/v1/app/patterns/${user.id}`);
      logger.debug('Patterns response', {
        success: response?.success,
        patternCount: response?.data?.patterns?.length ?? 0,
      });
      return response;
    },
    enabled: !!user?.id,
    staleTime: QUERY_STALE_TIME.long,
  });

  const insightsQuery = useQuery<InsightsResponse>({
    queryKey: ['patterns', 'insights', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      logger.debug('Fetching pattern insights', { userId: user.id });
      const response = await apiClient.get<InsightsResponse>(`/api/v1/app/patterns/${user.id}/insights`);
      logger.debug('Insights response', {
        success: response?.success,
        totalPatterns: response?.data?.insights?.summary?.totalPatterns ?? 0,
        hasInsightsData: !!response?.data?.insights,
      });
      return response;
    },
    enabled: !!user?.id,
    staleTime: QUERY_STALE_TIME.long,
  });

  const themesQuery = useQuery<ThemesResponse>({
    queryKey: ['patterns', 'themes', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      logger.debug('Fetching theme frequencies', { userId: user.id });
      const response = await apiClient.get<ThemesResponse>(`/api/v1/app/patterns/${user.id}/themes`);
      logger.debug('Themes response', {
        success: response?.success,
        themeCount: response?.data?.themes?.length ?? 0,
      });
      return response;
    },
    enabled: !!user?.id,
    staleTime: QUERY_STALE_TIME.long,
  });

  const analyzePatternsMutation = useMutation<AnalyzeResponse, Error>({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      try {
        logger.debug('Starting pattern analysis request', { userId: user.id });

        // Use GET instead of POST to work around Replit proxy POST body stripping issue
        const response = await apiClient.get<AnalyzeResponse>(`/api/v1/app/patterns/${user.id}/analyze`);

        logger.debug('Pattern analysis response', {
          hasResponse: !!response,
          success: response?.success,
          hasData: !!response?.data,
        });

        // Handle both nested and flat response structures
        if (response?.success && response?.data) {
          return response;
        }

        if (response && 'patterns' in response) {
          const flat = response as unknown as Record<string, unknown>;
          if (Array.isArray(flat.patterns) && typeof flat.userId === 'string' && typeof flat.analyzedAt === 'string') {
            return {
              success: true,
              data: {
                userId: flat.userId,
                patterns: flat.patterns as PatternInsight[],
                analyzedAt: flat.analyzedAt,
                patternCount:
                  typeof flat.patternCount === 'number'
                    ? flat.patternCount
                    : (flat.patterns as PatternInsight[]).length,
              },
            };
          }
        }

        throw new Error('Invalid response structure');
      } catch (error: unknown) {
        const errObj = error as { message?: string; response?: { data?: unknown } };
        logger.error('Pattern analysis request failed', {
          message: errObj?.message,
          response: errObj?.response?.data,
        });
        throw error;
      }
    },
    onSuccess: data => {
      // Defensive access to patternCount
      const patternCount = data?.data?.patternCount ?? data?.data?.patterns?.length ?? 0;
      logger.info('Pattern analysis complete', { patternCount });
      invalidateOnEvent(queryClient, { type: 'PATTERN_ANALYZED', userId: user?.id });
      toast({
        title: t('hooks.patterns.analysisComplete'),
        description: t('hooks.patterns.foundPatterns', { count: patternCount }),
      });
    },
    onError: error => {
      const errorMessage = error?.message || 'Unknown error';
      logger.error('Pattern analysis failed', { error: errorMessage });
      toast({
        title: t('hooks.patterns.analysisFailed'),
        description: t('hooks.patterns.couldNotAnalyze'),
        variant: 'destructive',
      });
    },
  });

  const refresh = async () => {
    invalidateOnEvent(queryClient, { type: 'PATTERN_ANALYZED', userId: user?.id });
  };

  const isError = patternsQuery.isError || insightsQuery.isError || themesQuery.isError;

  if (isError) {
    logger.warn('Pattern queries failed', {
      patternsError: patternsQuery.isError ? String(patternsQuery.error) : null,
      insightsError: insightsQuery.isError ? String(insightsQuery.error) : null,
      themesError: themesQuery.isError ? String(themesQuery.error) : null,
    });
  }

  return {
    patterns: patternsQuery.data?.data?.patterns || [],
    insights: insightsQuery.data?.data?.insights || null,
    themes: themesQuery.data?.data?.themes || [],
    topThemes: themesQuery.data?.data?.topThemes || [],

    isLoading: patternsQuery.isLoading || insightsQuery.isLoading || themesQuery.isLoading,
    isError,

    analyzePatterns: analyzePatternsMutation.mutate,
    isAnalyzing: analyzePatternsMutation.isPending,

    refresh,
  };
}
