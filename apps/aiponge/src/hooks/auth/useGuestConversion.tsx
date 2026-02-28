/**
 * Guest Conversion Hook
 * Tracks guest user actions and triggers strategic registration prompts
 *
 * ARCHITECTURE: All thresholds and prompts are configured in the backend
 * The frontend only displays the results
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuthState } from '../auth/useAuthState';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiRequest } from '../../lib/axiosApiClient';
import { logger } from '../../lib/logger';
import { useTranslation } from '../../i18n';

interface GuestConversionState {
  songsCreated: number;
  tracksPlayed: number;
  entriesCreated: number;
  lastPromptTime: string | null;
  hasSeenPrompt: boolean;
  convertedAt: string | null;
}

interface GuestConversionPolicy {
  firstSongThreshold: number;
  tracksPlayedThreshold: number;
  entriesCreatedThreshold: number;
  promptCooldownMs: number;
  promptMessages: {
    'first-song': { title: string; message: string };
    'multiple-tracks': { title: string; message: string };
    entries: { title: string; message: string };
  };
}

type TrackEventResponse = ServiceResponse<{
  shouldPrompt: boolean;
  promptType: 'first-song' | 'multiple-tracks' | 'entries' | null;
  promptContent?: {
    title: string;
    message: string;
  };
  stats: {
    songsCreated: number;
    tracksPlayed: number;
    entriesCreated: number;
  };
}>;

type PolicyResponse = ServiceResponse<GuestConversionPolicy>;

type StateResponse = ServiceResponse<GuestConversionState>;

export function useGuestConversion() {
  const { isGuest, userId } = useAuthState();
  const { t } = useTranslation();

  const [showPrompt, setShowPrompt] = useState(false);
  const [promptType, setPromptType] = useState<'first-song' | 'multiple-tracks' | 'entries'>('first-song');
  const [promptContent, setPromptContent] = useState<{ title: string; message: string } | null>(null);
  const [policy, setPolicy] = useState<GuestConversionPolicy | null>(null);
  const [state, setState] = useState<GuestConversionState>({
    songsCreated: 0,
    tracksPlayed: 0,
    entriesCreated: 0,
    lastPromptTime: null,
    hasSeenPrompt: false,
    convertedAt: null,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchPolicy() {
      try {
        const response = (await apiRequest('/api/v1/app/guest-conversion/policy')) as PolicyResponse;
        if (response.success && response.data) {
          setPolicy(response.data);
        }
      } catch (error) {
        logger.debug('Using default guest conversion policy', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    fetchPolicy();
  }, []);

  useEffect(() => {
    async function fetchState() {
      if (!isGuest || !userId) return;

      try {
        const response = (await apiRequest('/api/v1/app/guest-conversion/state')) as StateResponse;
        if (response.success && response.data) {
          setState(response.data);
        }
      } catch (error) {
        logger.debug('Failed to fetch guest conversion state', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    fetchState();
  }, [isGuest, userId]);

  const trackEvent = useCallback(
    async (eventType: 'song_created' | 'track_played' | 'entry_created') => {
      if (!isGuest || !userId) return;

      try {
        setLoading(true);
        const response = (await apiRequest('/api/v1/app/guest-conversion/event', {
          method: 'POST',
          data: { eventType },
          headers: { 'Content-Type': 'application/json' },
        })) as TrackEventResponse;

        if (response.success && response.data) {
          const data = response.data;
          setState(prev => ({
            ...prev,
            ...data.stats,
            hasSeenPrompt: prev.hasSeenPrompt || data.shouldPrompt,
          }));

          if (response.data.shouldPrompt && response.data.promptType) {
            setPromptType(response.data.promptType);
            setPromptContent(response.data.promptContent || null);
            setShowPrompt(true);
          }
        }
      } catch (error) {
        logger.error('Failed to track guest event', error);
      } finally {
        setLoading(false);
      }
    },
    [isGuest, userId]
  );

  const trackSongCreated = useCallback(async () => {
    await trackEvent('song_created');
  }, [trackEvent]);

  const trackTrackPlayed = useCallback(async () => {
    await trackEvent('track_played');
  }, [trackEvent]);

  const trackEntryCreated = useCallback(async () => {
    await trackEvent('entry_created');
  }, [trackEvent]);

  const closePrompt = useCallback(() => {
    setShowPrompt(false);
    setPromptContent(null);
  }, []);

  const getPromptTriggerAction = useCallback(
    (type: 'first-song' | 'multiple-tracks' | 'entries'): string => {
      switch (type) {
        case 'first-song':
          return t('components.guestConversion.triggerActions.firstSong');
        case 'multiple-tracks':
          return t('components.guestConversion.triggerActions.multipleTracks');
        case 'entries':
          return t('components.guestConversion.triggerActions.entries');
        default:
          return t('components.guestConversion.triggerActions.default');
      }
    },
    [t]
  );

  const getPromptContent = useCallback(() => {
    if (promptContent) {
      return {
        title: promptContent.title,
        message: promptContent.message,
        triggerAction: getPromptTriggerAction(promptType),
      };
    }

    const promptKeyMap: Record<string, string> = {
      'first-song': 'firstSong',
      'multiple-tracks': 'multipleTracks',
      entries: 'entries',
    };
    const promptKey = promptKeyMap[promptType] || 'firstSong';

    const backendContent = policy?.promptMessages?.[promptType];
    return {
      title: backendContent?.title || t(`components.guestConversion.prompts.${promptKey}.title`),
      message: backendContent?.message || t(`components.guestConversion.prompts.${promptKey}.message`),
      triggerAction: getPromptTriggerAction(promptType),
    };
  }, [promptType, promptContent, policy, t, getPromptTriggerAction]);

  return {
    isGuest,
    showPrompt,
    promptContent: getPromptContent(),
    trackSongCreated,
    trackTrackPlayed,
    trackEntryCreated,
    closePrompt,
    stats: state,
    loading,
  };
}
