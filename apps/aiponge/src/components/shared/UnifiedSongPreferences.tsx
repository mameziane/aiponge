import { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, BORDER_RADIUS, type ColorScheme } from '../../theme';
import { spacing } from '../../theme/spacing';
import { useTranslation } from '../../i18n';
import { SelectableChipGroup } from './SelectableChipGroup';
import { PreferenceSection } from './PreferenceSection';
import { useMusicPreferences } from '../../hooks/music/useMusicPreferences';
import { useConfigurableOptions, useContentLimitsWithDefaults } from '../../hooks/admin/useConfigurableOptions';
import {
  MOOD_KEYS,
  INSTRUMENT_KEYS,
  VOCAL_GENDER_KEYS,
  LANGUAGE_KEYS,
  GENRE_KEYS,
  type MoodKey,
  type InstrumentKey,
  type LanguageKey,
  type GenreKey,
} from '../../constants/musicPreferences';

const POPULAR_STYLE_SUGGESTIONS = [
  'Upbeat',
  'Mellow',
  'Dreamy',
  'Energetic',
  'Nostalgic',
  'Uplifting',
  'Smooth',
  'Groovy',
  'Atmospheric',
  'Powerful',
  'Intimate',
  'Soulful',
  'Warm',
  'Bright',
  'Dark',
];

export type PreferencesDisplayMode = 'essential' | 'expanded' | 'collapsed';

export interface ControlledMusicPreferences {
  musicStyles: string;
  genre: string;
  culturalLanguages: string[];
  mood: string;
  instruments: string[];
  vocalGender: 'f' | 'm' | null;
}

export interface PreferencesLoadingState {
  initial: boolean;
  musicStyles: boolean;
  genre: boolean;
  culturalLanguages: boolean;
  mood: boolean;
  instruments: boolean;
  vocalGender: boolean;
}

interface BaseUnifiedSongPreferencesProps {
  mode: PreferencesDisplayMode;
  initialExpanded?: boolean;
  showStyleSuggestions?: boolean;
  showStyleIntensity?: boolean;
  showNegativeTags?: boolean;
  styleWeight?: number;
  onStyleWeightChange?: (weight: number) => void;
  negativeTags?: string;
  onNegativeTagsChange?: (tags: string) => void;
  hideLanguageSelector?: boolean;
  variant?: 'default' | 'onboarding';
  expanded?: boolean;
  onToggleExpand?: () => void;
}

interface UncontrolledModeProps extends BaseUnifiedSongPreferencesProps {
  userId: string | undefined;
  controlled?: false;
  controlledPreferences?: never;
  controlledLoading?: never;
  onPreferencesChange?: never;
  onMusicStylesChange?: never;
  onGenreChange?: never;
  onCulturalLanguagesChange?: never;
  onMoodChange?: never;
  onInstrumentsChange?: never;
  onVocalGenderChange?: never;
}

interface ControlledModeProps extends BaseUnifiedSongPreferencesProps {
  userId?: never;
  controlled: true;
  controlledPreferences: ControlledMusicPreferences;
  controlledLoading?: PreferencesLoadingState;
  onPreferencesChange?: (
    key: keyof ControlledMusicPreferences,
    value: ControlledMusicPreferences[keyof ControlledMusicPreferences]
  ) => void;
  onMusicStylesChange?: (text: string) => void;
  onGenreChange?: (genre: GenreKey) => void;
  onCulturalLanguagesChange?: (lang: LanguageKey) => void;
  onMoodChange?: (mood: MoodKey) => void;
  onInstrumentsChange?: (instrument: InstrumentKey) => void;
  onVocalGenderChange?: (gender: 'f' | 'm') => void;
}

type UnifiedSongPreferencesProps = UncontrolledModeProps | ControlledModeProps;

export function UnifiedSongPreferences(props: UnifiedSongPreferencesProps) {
  const colors = useThemeColors();
  const {
    mode,
    initialExpanded = false,
    showStyleSuggestions = true,
    showStyleIntensity = false,
    showNegativeTags = false,
    styleWeight = 0.5,
    onStyleWeightChange,
    negativeTags = '',
    onNegativeTagsChange,
    hideLanguageSelector = false,
    variant = 'default',
  } = props;

  const { t, i18n } = useTranslation();
  const [internalExpanded, setInternalExpanded] = useState(mode === 'expanded' || initialExpanded);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isControlled = props.controlled === true;
  const userId = isControlled ? undefined : props.userId;

  const hookResult = useMusicPreferences(isControlled ? undefined : userId);

  const {
    languages: configurableLanguages,
    languageKeys: configurableLanguageKeys,
    genreKeys: configurableGenreKeys,
    moodKeys: configurableMoodKeys,
    instrumentKeys: configurableInstrumentKeys,
  } = useConfigurableOptions();
  const { limits: contentLimits } = useContentLimitsWithDefaults();

  const preferences = isControlled ? props.controlledPreferences : hookResult.preferences;
  const loading = isControlled
    ? (props.controlledLoading ?? {
        initial: false,
        musicStyles: false,
        genre: false,
        culturalLanguages: false,
        mood: false,
        instruments: false,
        vocalGender: false,
      })
    : hookResult.loading;

  const expanded = props.expanded !== undefined ? props.expanded : internalExpanded;
  const handleToggleExpand = props.onToggleExpand ?? (() => setInternalExpanded(prev => !prev));

  const handleMusicPreferencesChange = useCallback(
    (text: string) => {
      if (isControlled) {
        if (props.onMusicStylesChange) {
          props.onMusicStylesChange(text);
        } else if (props.onPreferencesChange) {
          props.onPreferencesChange('musicStyles', text);
        }
      } else {
        hookResult.handleMusicPreferencesChange(text);
      }
    },
    [isControlled, props, hookResult]
  );

  const handleGenreChange = useCallback(
    async (genre: GenreKey) => {
      if (isControlled) {
        if (props.onGenreChange) {
          props.onGenreChange(genre);
        } else if (props.onPreferencesChange) {
          const newGenre = props.controlledPreferences.genre === genre ? '' : genre;
          props.onPreferencesChange('genre', newGenre);
        }
      } else {
        await hookResult.handleGenreChange(genre);
      }
    },
    [isControlled, props, hookResult]
  );

  const handleCulturalLanguagesChange = useCallback(
    async (lang: LanguageKey) => {
      if (isControlled) {
        if (props.onCulturalLanguagesChange) {
          props.onCulturalLanguagesChange(lang);
        } else if (props.onPreferencesChange) {
          const currentLangs = props.controlledPreferences.culturalLanguages as LanguageKey[];
          const maxLangs = contentLimits?.maxLanguageSelections ?? 2;
          const newLangs = currentLangs.includes(lang)
            ? currentLangs.filter(l => l !== lang)
            : currentLangs.length < maxLangs
              ? [...currentLangs, lang]
              : currentLangs;
          props.onPreferencesChange('culturalLanguages', newLangs);
        }
      } else {
        await hookResult.handleCulturalLanguagesChange(lang);
      }
    },
    [isControlled, props, hookResult, contentLimits?.maxLanguageSelections]
  );

  const handleMoodChange = useCallback(
    async (mood: MoodKey) => {
      if (isControlled) {
        if (props.onMoodChange) {
          props.onMoodChange(mood);
        } else if (props.onPreferencesChange) {
          props.onPreferencesChange('mood', mood);
        }
      } else {
        await hookResult.handleMoodChange(mood);
      }
    },
    [isControlled, props, hookResult]
  );

  const handleInstrumentsChange = useCallback(
    async (instrument: InstrumentKey) => {
      if (isControlled) {
        if (props.onInstrumentsChange) {
          props.onInstrumentsChange(instrument);
        } else if (props.onPreferencesChange) {
          const currentInstruments = props.controlledPreferences.instruments as InstrumentKey[];
          const maxInstr = contentLimits?.maxInstrumentSelections ?? 4;
          const newInstruments = currentInstruments.includes(instrument)
            ? currentInstruments.filter(i => i !== instrument)
            : currentInstruments.length < maxInstr
              ? [...currentInstruments, instrument]
              : currentInstruments;
          props.onPreferencesChange('instruments', newInstruments);
        }
      } else {
        await hookResult.handleInstrumentsChange(instrument);
      }
    },
    [isControlled, props, hookResult, contentLimits?.maxInstrumentSelections]
  );

  const handleVocalGenderChange = useCallback(
    async (gender: 'f' | 'm') => {
      if (isControlled) {
        if (props.onVocalGenderChange) {
          props.onVocalGenderChange(gender);
        } else if (props.onPreferencesChange) {
          props.onPreferencesChange('vocalGender', gender);
        }
      } else {
        await hookResult.handleVocalGenderChange(gender);
      }
    },
    [isControlled, props, hookResult]
  );

  // as unknown: constant key arrays are typed as readonly string tuples; cast to mutable string[] for filter/map ops
  const activeLanguageKeys =
    configurableLanguageKeys.length > 0 ? configurableLanguageKeys : (LANGUAGE_KEYS as unknown as string[]);
  const activeGenreKeys =
    configurableGenreKeys.length > 0 ? configurableGenreKeys : (GENRE_KEYS as unknown as string[]);
  const activeMoodKeys = configurableMoodKeys.length > 0 ? configurableMoodKeys : (MOOD_KEYS as unknown as string[]);
  const activeInstrumentKeys =
    configurableInstrumentKeys.length > 0 ? configurableInstrumentKeys : (INSTRUMENT_KEYS as unknown as string[]);
  const maxLanguageSelections = contentLimits?.maxLanguageSelections ?? 2;
  const maxInstrumentSelections = contentLimits?.maxInstrumentSelections ?? 4;

  const languageOptions = useMemo(() => {
    const languageMap = new Map(configurableLanguages.map(l => [l.code, l]));
    return activeLanguageKeys.map(key => {
      const lang = languageMap.get(key);
      return {
        value: key,
        label: lang?.nativeLabel || lang?.label || t(`create.languages.${key}` as string) || key,
      };
    });
  }, [t, activeLanguageKeys, configurableLanguages]);

  const instrumentOptions = useMemo(
    () =>
      activeInstrumentKeys.map(key => ({
        value: key,
        label: t(`create.instrumentsList.${key}` as string) || key,
      })),
    [t, activeInstrumentKeys]
  );

  const moodOptions = useMemo(
    () =>
      activeMoodKeys.map(key => ({
        value: key,
        label: t(`create.moods.${key}` as string) || key,
      })),
    [t, activeMoodKeys]
  );

  const vocalGenderOptions = useMemo(
    () =>
      VOCAL_GENDER_KEYS.map(gender => ({
        value: gender.value,
        label: t(`create.vocalGenders.${gender.labelKey}`),
        icon: gender.icon,
      })),
    [t]
  );

  const genreOptions = useMemo(
    () =>
      activeGenreKeys.map(key => ({
        value: key,
        label: t(`create.genres.${key}` as string) || key,
      })),
    [t, activeGenreKeys]
  );

  const styleIntensityOptions = useMemo(
    () => [
      { value: 0.2, label: t('create.styleIntensity.subtle') },
      { value: 0.4, label: t('create.styleIntensity.light') },
      { value: 0.5, label: t('create.styleIntensity.balanced') },
      { value: 0.7, label: t('create.styleIntensity.strong') },
      { value: 1.0, label: t('create.styleIntensity.intense') },
    ],
    [t]
  );

  const handleStyleSuggestionPress = useCallback(
    (style: string) => {
      const currentStyles = preferences.musicStyles.trim();
      const isSelected = currentStyles.toLowerCase().includes(style.toLowerCase());
      if (isSelected) return;
      const newStyles = currentStyles ? `${currentStyles}, ${style}` : style;
      handleMusicPreferencesChange(newStyles);
    },
    [preferences.musicStyles, handleMusicPreferencesChange]
  );

  if (loading.initial && mode !== 'essential') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  const renderMusicStylesSection = () => (
    <PreferenceSection
      icon="musical-notes"
      title={t('create.musicStyles')}
      hint={t('create.musicStylesHint')}
      saving={loading.musicStyles}
      savingText={t('common.saving')}
    >
      <View style={styles.textInputContainer}>
        <TextInput
          style={styles.preferencesTextInput}
          value={preferences.musicStyles}
          onChangeText={handleMusicPreferencesChange}
          placeholder={t('create.musicStylesPlaceholder')}
          placeholderTextColor={colors.text.tertiary}
          multiline
          numberOfLines={mode === 'essential' ? 2 : 4}
          textAlignVertical="top"
          testID="input-music-preferences"
          accessibilityLabel={t('create.musicStyles')}
        />
        {preferences.musicStyles.length > 0 && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => handleMusicPreferencesChange('')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={t('common.clear')}
          >
            <Ionicons name="close-circle" size={20} color={colors.text.secondary} />
          </TouchableOpacity>
        )}
      </View>
      {showStyleSuggestions && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.styleSuggestionsContainer}
          contentContainerStyle={styles.styleSuggestionsContent}
        >
          {POPULAR_STYLE_SUGGESTIONS.map(style => {
            const isSelected = preferences.musicStyles.toLowerCase().includes(style.toLowerCase());
            return (
              <TouchableOpacity
                key={style}
                style={[styles.styleSuggestionChip, isSelected && styles.styleSuggestionChipSelected]}
                onPress={() => handleStyleSuggestionPress(style)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${style} style`}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.styleSuggestionText, isSelected && styles.styleSuggestionTextSelected]}>
                  {style}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </PreferenceSection>
  );

  const renderGenreSection = () => (
    <PreferenceSection
      icon="disc-outline"
      title={t('create.genre')}
      hint={t('create.genreHint')}
      saving={loading.genre}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.genreScrollContainer}
        contentContainerStyle={styles.genreScrollContent}
      >
        {genreOptions.map(option => {
          const isSelected = preferences.genre === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.genreChip, isSelected && styles.genreChipSelected]}
              onPress={() => handleGenreChange(option.value as GenreKey)}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.genreChipText, isSelected && styles.genreChipTextSelected]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </PreferenceSection>
  );

  const renderLanguageSection = () =>
    !hideLanguageSelector && (
      <PreferenceSection
        icon="language"
        title={t('create.lyricsLanguage')}
        hint={t('create.lyricsLanguageHint')}
        saving={loading.culturalLanguages}
      >
        <SelectableChipGroup
          options={languageOptions}
          selectedValues={preferences.culturalLanguages as LanguageKey[]}
          onSelect={lang => handleCulturalLanguagesChange(lang as LanguageKey)}
          multiSelect
          maxSelections={maxLanguageSelections}
          columns={4}
          testIdPrefix="button-language"
        />
      </PreferenceSection>
    );

  const renderVocalGenderSection = () => (
    <PreferenceSection
      icon="mic-outline"
      title={t('create.vocalStyle')}
      hint={t('create.vocalStyleHint')}
      saving={loading.vocalGender}
    >
      <SelectableChipGroup
        options={vocalGenderOptions}
        selectedValue={preferences.vocalGender ?? undefined}
        onSelect={gender => handleVocalGenderChange(gender as 'f' | 'm')}
        columns={2}
        size="large"
        testIdPrefix="button-vocal"
      />
    </PreferenceSection>
  );

  const renderMoodSection = () => (
    <PreferenceSection
      icon="happy-outline"
      title={t('create.currentMood')}
      hint={t('create.currentMoodHint')}
      saving={loading.mood}
    >
      <SelectableChipGroup
        options={moodOptions}
        selectedValue={(preferences.mood || undefined) as MoodKey | undefined}
        onSelect={mood => handleMoodChange(mood as MoodKey)}
        columns={3}
        testIdPrefix="button-mood"
      />
    </PreferenceSection>
  );

  const renderInstrumentsSection = () => (
    <PreferenceSection
      icon="musical-note"
      title={t('create.musicInstruments')}
      hint={t('create.musicInstrumentsHint')}
      saving={loading.instruments}
    >
      <SelectableChipGroup
        options={instrumentOptions}
        selectedValues={preferences.instruments as InstrumentKey[]}
        onSelect={inst => handleInstrumentsChange(inst as InstrumentKey)}
        multiSelect
        maxSelections={maxInstrumentSelections}
        columns={3}
        testIdPrefix="button-instrument"
      />
    </PreferenceSection>
  );

  const renderStyleIntensitySection = () =>
    showStyleIntensity &&
    onStyleWeightChange && (
      <PreferenceSection
        icon="options-outline"
        title={t('create.styleIntensity.title')}
        hint={t('create.styleIntensity.hint')}
      >
        <SelectableChipGroup
          options={styleIntensityOptions}
          selectedValue={styleWeight}
          onSelect={onStyleWeightChange}
          columns={3}
          testIdPrefix="button-style-intensity"
        />
      </PreferenceSection>
    );

  const renderNegativeTagsSection = () =>
    showNegativeTags &&
    onNegativeTagsChange && (
      <PreferenceSection
        icon="remove-circle-outline"
        title={t('create.negativeTags.title')}
        hint={t('create.negativeTags.hint')}
      >
        <TextInput
          style={styles.negativeTagsInput}
          value={negativeTags}
          onChangeText={onNegativeTagsChange}
          placeholder={t('create.negativeTags.placeholder')}
          placeholderTextColor={colors.text.tertiary}
          multiline={false}
          testID="input-negative-tags"
          accessibilityLabel={t('create.negativeTags.title')}
        />
      </PreferenceSection>
    );

  if (mode === 'essential') {
    return (
      <View style={styles.essentialContainer}>
        {renderVocalGenderSection()}
        {renderLanguageSection()}
        {renderMusicStylesSection()}
      </View>
    );
  }

  if (mode === 'expanded') {
    return (
      <View style={styles.expandedContainer}>
        <Text style={styles.expandedTitle}>{t('create.songPreferences')}</Text>
        <Text style={styles.description}>{t('profile.songPreferencesDescription')}</Text>
        {renderGenreSection()}
        {renderMusicStylesSection()}
        {renderLanguageSection()}
        {renderMoodSection()}
        {renderInstrumentsSection()}
        {renderVocalGenderSection()}
        {renderStyleIntensitySection()}
        {renderNegativeTagsSection()}
      </View>
    );
  }

  return (
    <View>
      <View style={styles.preferencesContainer}>
        <TouchableOpacity
          style={styles.preferencesHeader}
          onPress={handleToggleExpand}
          testID="button-toggle-preferences"
          accessibilityRole="button"
          accessibilityLabel={`${t('create.songPreferences')}, ${expanded ? t('create.songPreferencesCollapse') : t('create.songPreferencesExpand')}`}
          accessibilityState={{ expanded }}
        >
          <View style={styles.preferencesHeaderLeft}>
            <Text style={styles.preferencesTitle}>{t('create.songPreferences')}</Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text.secondary} />
        </TouchableOpacity>

        {expanded && (
          <View style={styles.preferencesContent}>
            {renderGenreSection()}
            {renderMusicStylesSection()}
            {renderLanguageSection()}
            {renderInstrumentsSection()}
            {renderMoodSection()}
            {renderVocalGenderSection()}
            {renderStyleIntensitySection()}
            {renderNegativeTagsSection()}
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: spacing.sectionGap * 4,
    },
    loadingText: {
      color: colors.text.secondary,
      marginTop: spacing.componentGap,
      fontSize: 14,
    },
    essentialContainer: {
      gap: spacing.componentGap,
    },
    expandedContainer: {
      paddingHorizontal: spacing.screenHorizontal,
      paddingTop: spacing.sectionGap,
    },
    expandedTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    description: {
      fontSize: 14,
      color: colors.text.secondary,
      marginBottom: spacing.sectionGap,
      lineHeight: 20,
    },
    softHintLabel: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginHorizontal: spacing.screenHorizontal,
      marginTop: 12,
      marginBottom: 8,
      fontStyle: 'italic',
      textAlign: 'center',
    },
    preferencesContainer: {
      marginHorizontal: spacing.screenHorizontal,
      marginTop: 8,
      marginBottom: 8,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.primary,
      overflow: 'hidden',
    },
    preferencesHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.elementPadding,
      paddingVertical: 10,
    },
    preferencesHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    preferencesTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    preferencesContent: {
      paddingHorizontal: spacing.componentGap,
      paddingBottom: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border.primary,
    },
    textInputContainer: {
      position: 'relative' as const,
    },
    preferencesTextInput: {
      fontSize: 15,
      color: colors.text.primary,
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      paddingRight: 36,
      minHeight: 90,
      maxHeight: 180,
      lineHeight: 22,
    },
    clearButton: {
      position: 'absolute' as const,
      top: 8,
      right: 8,
      padding: 4,
    },
    negativeTagsInput: {
      fontSize: 15,
      color: colors.text.primary,
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.sm,
      borderWidth: 1,
      borderColor: colors.border.primary,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 44,
    },
    styleSuggestionsContainer: {
      marginTop: 10,
      marginHorizontal: -4,
    },
    styleSuggestionsContent: {
      paddingHorizontal: 4,
      gap: 8,
    },
    styleSuggestionChip: {
      backgroundColor: colors.background.tertiary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.lg,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    styleSuggestionChipSelected: {
      backgroundColor: colors.brand.accent,
      borderColor: colors.brand.accent,
    },
    styleSuggestionText: {
      fontSize: 13,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    styleSuggestionTextSelected: {
      color: colors.interactive.primaryForeground,
    },
    genreScrollContainer: {
      marginHorizontal: -4,
    },
    genreScrollContent: {
      paddingHorizontal: 4,
      gap: 8,
      flexDirection: 'row',
    },
    genreChip: {
      backgroundColor: colors.background.tertiary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    genreChipSelected: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    genreChipText: {
      fontSize: 14,
      color: colors.text.secondary,
      fontWeight: '500',
    },
    genreChipTextSelected: {
      color: colors.interactive.primaryForeground,
      fontWeight: '600',
    },
  });

export default UnifiedSongPreferences;
