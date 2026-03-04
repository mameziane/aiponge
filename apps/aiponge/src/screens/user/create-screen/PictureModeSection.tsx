/**
 * Picture Mode Section
 * Renders the picture-to-song generation UI: image preview, context input,
 * and generate button. Shown when the user navigates via picture long-press.
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Image,
  TextInput,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';

import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { useTranslation } from '../../../i18n';
import { logger } from '../../../lib/logger';
import type { MusicPreferencesState } from '../../../hooks/music/useMusicPreferences';

export interface PictureModeSectionProps {
  decodedPictureUri: string | null;
  pictureUri: string | null;
  pictureContext: string;
  onPictureContextChange: (text: string) => void;
  canGenerate: boolean;
  isGeneratingSong: boolean;
  preferences: MusicPreferencesState;
  generateSong: (
    culturalLanguages?: string[],
    options?: {
      artworkUrl?: string;
      pictureContext?: string;
      styleWeight?: number;
      negativeTags?: string;
      vocalGender?: 'f' | 'm' | null;
      instruments?: string[];
      genre?: string;
      onGenerationStart?: () => void;
    }
  ) => void;
  musicPath: string;
}

export function PictureModeSection({
  decodedPictureUri,
  pictureUri,
  pictureContext,
  onPictureContextChange,
  canGenerate,
  isGeneratingSong,
  preferences,
  generateSong,
  musicPath,
}: PictureModeSectionProps) {
  const colors = useThemeColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const handleGenerate = React.useCallback(() => {
    if (!canGenerate || isGeneratingSong) return;

    if (!decodedPictureUri) {
      logger.error('[PictureModeSection] decodedPictureUri is falsy', undefined, {
        pictureUri,
        decodedPictureUri,
      });
      return;
    }

    logger.debug('[PictureModeSection] Generating song from picture', {
      artworkUrl: decodedPictureUri,
      artworkUrlLength: decodedPictureUri.length,
      pictureContext,
      hasImage: !!decodedPictureUri,
    });

    const languageParam = preferences.culturalLanguages.length > 0 ? preferences.culturalLanguages : undefined;
    generateSong(languageParam, {
      artworkUrl: decodedPictureUri,
      pictureContext: pictureContext || undefined,
      styleWeight: preferences.styleWeight,
      negativeTags: preferences.negativeTags,
      vocalGender: preferences.vocalGender,
      instruments: preferences.instruments,
      genre: preferences.genre,
      onGenerationStart: () => {
        router.push(musicPath as Href);
      },
    });
  }, [
    canGenerate,
    isGeneratingSong,
    decodedPictureUri,
    pictureUri,
    pictureContext,
    preferences,
    generateSong,
    musicPath,
  ]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="image" size={20} color={colors.brand.primary} />
        <Text style={styles.headerText}>{t('create.pictureToSong')}</Text>
      </View>
      <View style={styles.previewContainer}>
        <Image source={{ uri: decodedPictureUri! }} style={styles.preview} resizeMode="cover" />
      </View>
      <TextInput
        style={styles.contextInput}
        value={pictureContext}
        onChangeText={onPictureContextChange}
        placeholder={t('create.pictureContextPlaceholder')}
        placeholderTextColor={colors.text.tertiary}
        multiline
        maxLength={500}
      />
      <Text style={styles.hint}>{t('create.pictureHint')}</Text>

      <TouchableOpacity
        style={[styles.generateButton, (!canGenerate || isGeneratingSong) && styles.generateButtonDisabled]}
        onPress={handleGenerate}
        disabled={!canGenerate || isGeneratingSong}
      >
        {isGeneratingSong ? (
          <ActivityIndicator size="small" color={colors.brand.primary} />
        ) : (
          <>
            <Ionicons name="musical-notes" size={20} color={colors.background.primary} />
            <Text style={styles.generateButtonText}>{t('create.generateFromPicture')}</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      marginHorizontal: spacing.screenHorizontal,
      marginVertical: spacing.sectionGap,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.lg,
      padding: spacing.elementPadding,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    headerText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    previewContainer: {
      borderRadius: BORDER_RADIUS.md,
      overflow: 'hidden',
      marginBottom: 12,
    },
    preview: {
      width: '100%',
      height: Dimensions.get('window').width * 0.5,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.tertiary,
    },
    contextInput: {
      backgroundColor: colors.background.tertiary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      color: colors.text.primary,
      fontSize: 14,
      minHeight: 60,
      textAlignVertical: 'top',
      marginBottom: 8,
    },
    hint: {
      fontSize: 12,
      color: colors.text.tertiary,
      fontStyle: 'italic',
    },
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.brand.primary,
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: BORDER_RADIUS.md,
      marginTop: 16,
    },
    generateButtonDisabled: {
      opacity: 0.5,
    },
    generateButtonText: {
      color: colors.background.primary,
      fontSize: 16,
      fontWeight: '600',
    },
  });
