import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../lib/logger';

const SETTINGS_KEYS = {
  LANGUAGE: '@aiponge/language',
  EXPLICIT_CONTENT_FILTER: '@aiponge/explicit_content_filter',
  PROFANITY_FILTER: '@aiponge/profanity_filter',
  VIOLENCE_FILTER: '@aiponge/violence_filter',
} as const;

export interface UserSettings {
  language: string;
  explicitContentFilter: boolean;
  profanityFilter: boolean;
  violenceFilter: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  language: 'en',
  explicitContentFilter: false,
  profanityFilter: false,
  violenceFilter: false,
};

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [language, explicitContent, profanity, violence] = await Promise.all([
        AsyncStorage.getItem(SETTINGS_KEYS.LANGUAGE),
        AsyncStorage.getItem(SETTINGS_KEYS.EXPLICIT_CONTENT_FILTER),
        AsyncStorage.getItem(SETTINGS_KEYS.PROFANITY_FILTER),
        AsyncStorage.getItem(SETTINGS_KEYS.VIOLENCE_FILTER),
      ]);

      setSettings({
        language: language || DEFAULT_SETTINGS.language,
        explicitContentFilter: explicitContent === 'true',
        profanityFilter: profanity === 'true',
        violenceFilter: violence === 'true',
      });
    } catch (error) {
      logger.error('Failed to load settings', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateLanguage = async (language: string) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEYS.LANGUAGE, language);
      setSettings(prev => ({ ...prev, language }));
      return true;
    } catch (error) {
      logger.error('Failed to update language', error);
      return false;
    }
  };

  const updateExplicitContentFilter = async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEYS.EXPLICIT_CONTENT_FILTER, enabled.toString());
      setSettings(prev => ({ ...prev, explicitContentFilter: enabled }));
      return true;
    } catch (error) {
      logger.error('Failed to update explicit content filter', error);
      return false;
    }
  };

  const updateProfanityFilter = async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEYS.PROFANITY_FILTER, enabled.toString());
      setSettings(prev => ({ ...prev, profanityFilter: enabled }));
      return true;
    } catch (error) {
      logger.error('Failed to update profanity filter', error);
      return false;
    }
  };

  const updateViolenceFilter = async (enabled: boolean) => {
    try {
      await AsyncStorage.setItem(SETTINGS_KEYS.VIOLENCE_FILTER, enabled.toString());
      setSettings(prev => ({ ...prev, violenceFilter: enabled }));
      return true;
    } catch (error) {
      logger.error('Failed to update violence filter', error);
      return false;
    }
  };

  return {
    settings,
    isLoading,
    updateLanguage,
    updateExplicitContentFilter,
    updateProfanityFilter,
    updateViolenceFilter,
  };
}
