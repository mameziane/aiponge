import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
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
import hiIN from './locales/hi-IN.json';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE, type SupportedLanguage } from './types';

const resources = {
  'en-US': { translation: enUS },
  'es-ES': { translation: esES },
  'pt-BR': { translation: ptBR },
  'de-DE': { translation: deDE },
  'fr-FR': { translation: frFR },
  ar: { translation: ar },
  'ja-JP': { translation: jaJP },
  'hi-IN': { translation: hiIN },
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

/**
 * Ensure the native RTL layout direction matches the language.
 * Compares against I18nManager.isRTL (the actual native state) to
 * detect mismatches. Returns true when a reload is needed.
 */
export const applyRTL = (language: SupportedLanguage): boolean => {
  const shouldBeRTL = isRTLLanguage(language);
  const currentIsRTL = I18nManager.isRTL;

  if (currentIsRTL !== shouldBeRTL) {
    logger.debug('i18n RTL mismatch — forcing direction change', { currentIsRTL, shouldBeRTL });
    I18nManager.allowRTL(shouldBeRTL);
    I18nManager.forceRTL(shouldBeRTL);
    return true; // requires reload for layout to update
  }

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

export interface I18nInitResult {
  language: SupportedLanguage;
  requiresRTLReload: boolean;
}

/**
 * Complete i18n initialization by detecting the device language and
 * applying it. No stored preference is read — the OS per-app language
 * setting (iOS 13+ / Android 13+) controls the device locale that
 * expo-localization returns.
 */
export const initI18n = async (): Promise<I18nInitResult> => {
  const deviceLanguage = getDeviceLanguage();

  logger.debug('i18n completing initialization', {
    device: deviceLanguage,
    current: i18n.language,
  });

  if (i18n.language !== deviceLanguage) {
    await i18n.changeLanguage(deviceLanguage);
  }

  const requiresRTLReload = applyRTL(deviceLanguage);

  return {
    language: deviceLanguage,
    requiresRTLReload,
  };
};

export { i18n };
export { useTranslation } from 'react-i18next';
export * from './types';
