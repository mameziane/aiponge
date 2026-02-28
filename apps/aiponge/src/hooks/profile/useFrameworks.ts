/**
 * Hook to fetch psychological frameworks from the API
 * Refactored to use react-query for proper caching and state management
 */

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/axiosApiClient';
import { queryKeys } from '../../lib/queryKeys';
import { QUERY_STALE_TIME } from '../../constants/appConfig';
import type { ServiceResponse } from '@aiponge/shared-contracts';

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

export function getCategoryColor(category: string): string {
  return FRAMEWORK_CATEGORIES.find(c => c.id === category)?.color ?? '#888888';
}

interface RawFramework {
  id: string;
  name: string;
  shortName: string;
  category: string;
  description: string;
  keyPrinciples?: string[];
  therapeuticGoals?: string[];
  triggerPatterns?: string[];
  isEnabled?: boolean;
  enabled?: boolean;
  songStructureHint?: string;
}

interface UseFrameworksResult {
  frameworks: PsychologicalFramework[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useFrameworks(): UseFrameworksResult {
  const query = useQuery({
    queryKey: queryKeys.frameworks.list(),
    queryFn: async () => {
      const response = await apiClient.get<ServiceResponse<RawFramework[]>>('/api/v1/frameworks');
      if (!response.success) {
        throw new Error('Failed to fetch frameworks');
      }
      return response.data || [];
    },
    select: (data: RawFramework[]) =>
      data.map(
        (f): PsychologicalFramework => ({
          id: f.id,
          name: f.name,
          shortName: f.shortName,
          category: f.category as FrameworkCategory,
          description: f.description,
          keyPrinciples: f.keyPrinciples || [],
          therapeuticGoals: f.therapeuticGoals || [],
          triggerPatterns: f.triggerPatterns || [],
          enabled: f.isEnabled ?? f.enabled ?? true,
          songStructureHint: f.songStructureHint || undefined,
        })
      ),
    staleTime: QUERY_STALE_TIME.long,
    refetchOnWindowFocus: false,
  });

  return {
    frameworks: query.data || [],
    isLoading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
    refetch: async () => {
      await query.refetch();
    },
  };
}
