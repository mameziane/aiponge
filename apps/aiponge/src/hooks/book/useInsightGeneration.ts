import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiClient } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { useTranslation } from '../../i18n';
import { useToast } from '../ui/use-toast';
import { invalidateOnEvent } from '../../lib/cacheManager';
import { CONFIG } from '../../constants/appConfig';

export function useInsightGeneration() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [generatedInsight, setGeneratedInsight] = useState<string | null>(null);
  const [currentEntryContent, setCurrentEntryContent] = useState<string>('');
  const [currentEntryId, setCurrentEntryId] = useState<string | null>(null);

  const generateInsightMutation = useMutation({
    mutationFn: async ({ entryContent, entryId }: { entryContent: string; entryId: string | null }) => {
      const prompt = `Analyze this personal reflection and provide a brief, meaningful insight that helps the person understand their entries and emotions more deeply. Be empathetic and constructive:\n\n"${entryContent}"\n\nProvide a concise insight (2-3 sentences) that offers a fresh perspective or helpful observation.`;

      logger.debug('Generating insight from entry', { contentLength: entryContent.length, entryId });

      const response = await apiClient.post<
        ServiceResponse<{ content?: string }> & { content?: { content?: string } | string; message?: string }
      >(
        '/api/v1/app/content/generate',
        {
          prompt,
          contentType: 'analysis',
          parameters: {
            tone: 'empathetic',
            length: 'brief',
          },
        },
        { timeout: CONFIG.api.generationTimeoutMs }
      );

      logger.debug('Insight generation response', {
        success: response?.success,
        hasContent: !!response?.content,
        hasData: !!response?.data,
      });

      if (!response || response.success === false) {
        const errorMessage = response?.error?.message || response?.message || 'Failed to generate insight';
        throw new Error(errorMessage);
      }

      const contentObj = response.content as { content?: string } | undefined;
      const dataObj = response.data as { content?: string } | undefined;

      const insightContent =
        contentObj?.content ||
        (typeof response.content === 'string' ? response.content : null) ||
        dataObj?.content ||
        null;

      if (!insightContent) {
        throw new Error('No insight content received from API');
      }

      let savedToDatabase = false;
      if (entryId) {
        try {
          await apiClient.post<ServiceResponse<unknown>>('/api/v1/app/insights', {
            entryId,
            content: insightContent,
            type: 'reflection',
            category: 'general',
          });
          savedToDatabase = true;
          logger.info('Insight saved to database', { entryId });
        } catch (saveError) {
          logger.error('Failed to save insight to database', {
            error: saveError instanceof Error ? saveError.message : String(saveError),
            entryId,
          });
        }
      }

      return { content: insightContent, entryId };
    },
    onSuccess: ({ content, entryId }) => {
      if (content) {
        setGeneratedInsight(content);
        logger.info('Insight generated successfully');

        if (entryId) {
          invalidateOnEvent(queryClient, { type: 'INSIGHT_GENERATED', entryId });
        }
      }
    },
    onError: error => {
      logger.error('Failed to generate insight', error);
      toast({
        title: t('common.error'),
        description: t('reflect.insightGenerationFailed'),
        variant: 'destructive',
      });
    },
  });

  const generateInsightFromEntry = useCallback(async (): Promise<string | null> => {
    if (!currentEntryContent.trim()) {
      throw new Error('generateInsightFromEntry: Cannot generate insight from empty content');
    }
    const result = await generateInsightMutation.mutateAsync({
      entryContent: currentEntryContent,
      entryId: currentEntryId,
    });
    return result.content;
  }, [currentEntryContent, currentEntryId, generateInsightMutation]);

  const clearGeneratedInsight = useCallback(() => {
    setGeneratedInsight(null);
  }, []);

  const setEntryContent = useCallback((content: string, entryId?: string | null) => {
    setCurrentEntryContent(content);
    if (entryId !== undefined) {
      setCurrentEntryId(entryId);
    }
  }, []);

  return {
    generatedInsight,
    generatingInsight: generateInsightMutation.isPending,
    generateInsightFromEntry,
    clearGeneratedInsight,
    setEntryContent,
  };
}
