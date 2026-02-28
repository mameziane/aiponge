import type en from './locales/en-US.json';

export type TranslationResources = typeof en;

export type SupportedLanguage = 'en-US' | 'es-ES' | 'pt-BR' | 'de-DE' | 'fr-FR' | 'ar' | 'ja-JP';

export interface LanguageOption {
  code: SupportedLanguage;
  label: string;
  nativeLabel: string;
  isRTL: boolean;
  hasTranslations: boolean;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en-US', label: 'English', nativeLabel: 'English', isRTL: false, hasTranslations: true },
  { code: 'es-ES', label: 'Spanish', nativeLabel: 'Español', isRTL: false, hasTranslations: true },
  { code: 'pt-BR', label: 'Portuguese', nativeLabel: 'Português', isRTL: false, hasTranslations: true },
  { code: 'de-DE', label: 'German', nativeLabel: 'Deutsch', isRTL: false, hasTranslations: true },
  { code: 'fr-FR', label: 'French', nativeLabel: 'Français', isRTL: false, hasTranslations: true },
  { code: 'ar', label: 'Arabic', nativeLabel: 'العربية', isRTL: true, hasTranslations: true },
  { code: 'ja-JP', label: 'Japanese', nativeLabel: '日本語', isRTL: false, hasTranslations: true },
];

export const UPCOMING_LANGUAGES: LanguageOption[] = [];

export const AVAILABLE_LANGUAGES = SUPPORTED_LANGUAGES.filter(lang => lang.hasTranslations);

export const DEFAULT_LANGUAGE: SupportedLanguage = 'en-US';

export const LANGUAGE_STORAGE_KEY = 'aiponge_ui_language';
