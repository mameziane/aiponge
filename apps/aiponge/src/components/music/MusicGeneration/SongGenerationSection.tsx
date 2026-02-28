import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EntryNavigator } from '../../EntryNavigator';
import type { Entry } from '@/types/profile.types';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { spacing } from '@/theme/spacing';
import { useTranslation } from '@/i18n';

interface SongGenerationSectionProps {
  entries: Entry[];
  totalEntries: number;
  selectedEntry: string | null;
  selectedEntryId: string | null;
  currentEntryContent: string;
  isLoadingEntries: boolean;
  onEntrySelect: (entry: Entry) => void;
  onEntriesUpdate: () => Promise<void>;
  onContentChange: (content: string) => void;
  onCurrentEntryChange: (entry: Entry | null) => void;
  onEntryCreated: () => void;
  onGenerateSong: () => void;
  canGenerate: boolean;
  insufficientCredits: boolean;
  creditCost?: number;
  currentBalance?: number;
  creditsLoading?: boolean;
  onGetMoreCredits: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  navigateToEntryId?: string | null;
  onNavigatedToEntry?: () => void;
  onImageLongPress?: (imageUri: string) => void;
}

export function SongGenerationSection({
  entries,
  totalEntries,
  selectedEntry,
  selectedEntryId,
  currentEntryContent,
  isLoadingEntries,
  onEntrySelect,
  onEntriesUpdate,
  onContentChange,
  onCurrentEntryChange,
  onEntryCreated,
  onGenerateSong,
  canGenerate,
  insufficientCredits,
  creditCost = 15,
  currentBalance = 0,
  creditsLoading = false,
  onGetMoreCredits,
  expanded,
  onToggleExpand,
  navigateToEntryId,
  onNavigatedToEntry,
  onImageLongPress,
}: SongGenerationSectionProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const hasContent = currentEntryContent.trim().length > 0;

  return (
    <View style={styles.preferencesContainer}>
      <TouchableOpacity
        style={styles.preferencesHeader}
        onPress={onToggleExpand}
        testID="button-toggle-song-generation"
      >
        <View style={styles.preferencesHeaderLeft}>
          <Text style={styles.preferencesTitle}>{t('create.songGeneration')}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text.secondary} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.preferencesContent}>
          {/* Your Entry Section */}
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeader}>
              <Ionicons name="create" size={16} color={colors.brand.primary} />
              <Text style={styles.subsectionTitle}>{t('create.yourEntry')}</Text>
            </View>
            <Text style={styles.preferencesHint}>{t('create.entrySelectionHint')}</Text>

            {/* Entry Navigator - Create new or select/edit existing entries */}
            <View style={styles.entryNavigatorContainer}>
              <EntryNavigator
                entries={entries || []}
                totalEntriesCount={totalEntries}
                isLoading={isLoadingEntries}
                selectionMode={true}
                selectedEntryId={selectedEntryId ?? undefined}
                onEntrySelect={onEntrySelect}
                onEntriesUpdate={onEntriesUpdate}
                onContentChange={onContentChange}
                onCurrentEntryChange={onCurrentEntryChange}
                onEntryCreated={onEntryCreated}
                showDateChapterRow={false}
                showEmotionSlider={false}
                middleActionContent={undefined}
                navigateToEntryId={navigateToEntryId}
                onNavigatedToEntry={onNavigatedToEntry}
                onImageLongPress={onImageLongPress}
              />
            </View>

            {/* Insufficient credits warning */}
            {selectedEntry && hasContent && insufficientCredits && (
              <View style={styles.insufficientCreditsWarning}>
                <Ionicons name="warning" size={20} color={colors.semantic.warning} />
                <Text style={styles.warningText}>
                  {t('create.insufficientCreditsMessage', { cost: creditCost })}{' '}
                  {t('create.currentBalance', { balance: currentBalance })}{' '}
                  <Text style={styles.warningLink} onPress={onGetMoreCredits}>
                    {t('create.getMoreSongs')}
                  </Text>
                </Text>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
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
    sectionContainer: {
      marginBottom: 4,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 6,
    },
    subsectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginLeft: 6,
    },
    preferencesHint: {
      fontSize: 13,
      color: colors.text.secondary,
      marginBottom: 8,
      lineHeight: 18,
    },
    entryNavigatorContainer: {
      marginBottom: 4,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: spacing.componentGap,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    characterCountContainer: {
      position: 'absolute',
      bottom: 12,
      right: spacing.elementPadding,
      backgroundColor: colors.background.primary,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
    },
    characterCount: {
      fontSize: 12,
      color: colors.text.tertiary,
      fontWeight: '500',
    },
    insufficientCreditsWarning: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.semantic.warningLight,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      marginBottom: 12,
      gap: 8,
    },
    warningText: {
      flex: 1,
      fontSize: 14,
      color: colors.semantic.warning,
      lineHeight: 20,
    },
    warningLink: {
      textDecorationLine: 'underline',
      fontWeight: '600',
    },
    primaryButton: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
      paddingVertical: 14,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fullWidthButton: {
      width: '100%',
      marginTop: 12,
    },
    disabledButton: {
      backgroundColor: colors.state.disabled,
      opacity: 0.6,
    },
    primaryButtonText: {
      color: colors.absolute.white,
      fontSize: 16,
      fontWeight: '600',
    },
    queueInfoText: {
      marginTop: 8,
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    generateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.sm,
      paddingVertical: 8,
      paddingHorizontal: 16,
      gap: 6,
    },
    generateButtonDisabled: {
      opacity: 0.4,
    },
    generateButtonText: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: '600',
    },
  });

export default SongGenerationSection;
