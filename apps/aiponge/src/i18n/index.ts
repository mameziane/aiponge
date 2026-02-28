import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { I18nManager, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { logger } from '../lib/logger';

import enUS from './locales/en-US.json';
import esES from './locales/es-ES.json';
import ptBR from './locales/pt-BR.json';
import deDE from './locales/de-DE.json';
import frFR from './locales/fr-FR.json';
import ar from './locales/ar.json';
import jaJP from './locales/ja-JP.json';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, type SupportedLanguage } from './types';

const resources = {
  'en-US': { translation: enUS },
  'es-ES': { translation: esES },
  'pt-BR': { translation: ptBR },
  'de-DE': { translation: deDE },
  'fr-FR': { translation: frFR },
  ar: { translation: ar },
  'ja-JP': { translation: jaJP },
} as const;

// Initialize i18n with react-i18next plugin
// This returns a promise that resolves when init is complete
const i18nReadyPromise = i18n.use(initReactI18next).init({
  compatibilityJSON: 'v4',
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
  },
});

// Export the ready promise for entry point to await before loading expo-router
export const i18nReady = i18nReadyPromise;

export const getSupportedLanguageCode = (languageTag: string): SupportedLanguage => {
  const exactMatch = SUPPORTED_LANGUAGES.find(lang => lang.code === languageTag);
  if (exactMatch) return exactMatch.code;

  const languageOnly = languageTag.split('-')[0];
  const partialMatch = SUPPORTED_LANGUAGES.find(
    lang => lang.code.startsWith(languageOnly + '-') || lang.code === languageOnly
  );
  if (partialMatch) return partialMatch.code;

  return DEFAULT_LANGUAGE;
};

export const getStoredLanguage = async (): Promise<SupportedLanguage | null> => {
  try {
    const stored = await SecureStore.getItemAsync(LANGUAGE_STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.some(lang => lang.code === stored)) {
      return stored as SupportedLanguage;
    }
    return null;
  } catch (error) {
    logger.warn('i18n failed to read stored language', { error });
    return null;
  }
};

export const setStoredLanguage = async (language: SupportedLanguage): Promise<void> => {
  try {
    await SecureStore.setItemAsync(LANGUAGE_STORAGE_KEY, language);
  } catch (error) {
    logger.warn('i18n failed to store language', { error });
  }
};

export const getDeviceLanguage = (): SupportedLanguage => {
  try {
    const locales = getLocales();
    if (locales.length > 0) {
      return getSupportedLanguageCode(locales[0].languageTag);
    }
  } catch (error) {
    logger.warn('i18n failed to get device locale', { error });
  }
  return DEFAULT_LANGUAGE;
};

export const isRTLLanguage = (language: SupportedLanguage): boolean => {
  const langConfig = SUPPORTED_LANGUAGES.find(lang => lang.code === language);
  return langConfig?.isRTL || false;
};

const RTL_APPLIED_KEY = 'aiponge_rtl_applied';

const getAppliedRTL = async (): Promise<boolean | null> => {
  try {
    const stored = await SecureStore.getItemAsync(RTL_APPLIED_KEY);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
    return null;
  } catch {
    return null;
  }
};

const setAppliedRTL = async (isRTL: boolean): Promise<void> => {
  try {
    await SecureStore.setItemAsync(RTL_APPLIED_KEY, isRTL ? 'true' : 'false');
  } catch (error) {
    logger.warn('i18n failed to persist RTL state', { error });
  }
};

export const applyRTL = async (language: SupportedLanguage): Promise<boolean> => {
  const shouldBeRTL = isRTLLanguage(language);
  const currentIsRTL = I18nManager.isRTL;
  const appliedRTL = await getAppliedRTL();

  if (appliedRTL === shouldBeRTL) {
    return false;
  }

  const needsReload = currentIsRTL !== shouldBeRTL;

  if (needsReload) {
    logger.debug('i18n RTL mismatch', { currentIsRTL, shouldBeRTL });
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);
    await setAppliedRTL(shouldBeRTL);
    return true;
  }

  await setAppliedRTL(shouldBeRTL);
  return false;
};

export const reloadAppForRTL = async (): Promise<void> => {
  try {
    if (__DEV__) {
      logger.debug('i18n RTL change requires manual app restart in dev mode');
      const { DevSettings } = require('react-native');
      if (DevSettings && DevSettings.reload) {
        DevSettings.reload();
      }
      return;
    }
    await Updates.reloadAsync();
  } catch (error) {
    logger.warn('i18n failed to reload app', { error });
  }
};

export interface LanguageChangeResult {
  success: boolean;
  requiresReload: boolean;
}

export const changeLanguage = async (language: SupportedLanguage): Promise<LanguageChangeResult> => {
  try {
    if (!resources[language]) {
      logger.warn('i18n no translations for language, falling back to default', {
        language,
        fallback: DEFAULT_LANGUAGE,
      });
    }

    await i18n.changeLanguage(language);
    await setStoredLanguage(language);
    const requiresReload = await applyRTL(language);

    return { success: true, requiresReload };
  } catch (error) {
    logger.error('i18n failed to change language', error);
    return { success: false, requiresReload: false };
  }
};

export interface I18nInitResult {
  language: SupportedLanguage;
  requiresRTLReload: boolean;
}

export const initI18n = async (): Promise<I18nInitResult> => {
  const storedLanguage = await getStoredLanguage();
  const deviceLanguage = getDeviceLanguage();
  let targetLanguage = storedLanguage || deviceLanguage;

  if (!SUPPORTED_LANGUAGES.some(lang => lang.code === targetLanguage)) {
    logger.warn('i18n language not supported, falling back to default', {
      language: targetLanguage,
      fallback: DEFAULT_LANGUAGE,
    });
    targetLanguage = DEFAULT_LANGUAGE;
    await setStoredLanguage(DEFAULT_LANGUAGE);
  }

  logger.debug('i18n completing initialization', {
    stored: storedLanguage,
    device: deviceLanguage,
    selected: targetLanguage,
    current: i18n.language,
  });

  if (i18n.language !== targetLanguage) {
    await i18n.changeLanguage(targetLanguage);
  }

  const requiresRTLReload = await applyRTL(targetLanguage);

  return {
    language: targetLanguage,
    requiresRTLReload,
  };
};

export { i18n };
export { useTranslation } from 'react-i18next';
export * from './types';
