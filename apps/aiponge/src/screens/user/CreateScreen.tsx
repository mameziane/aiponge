import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  TextInput,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useMusicGeneration } from '../../hooks/music/useMusicGeneration';
import { useCredits } from '../../hooks/commerce/useCredits';
import { useUsageTracking } from '../../hooks/profile/useUsageTracking';
import { useGuestConversion } from '../../hooks/auth/useGuestConversion';
import { useMusicPreferences } from '../../hooks/music/useMusicPreferences';
import { useAllChapters } from '../../hooks/book/useUnifiedLibrary';
import { GuestConversionPrompt } from '../../components/auth/GuestConversionPrompt';
import type { Entry } from '@/types/profile.types';
import { UpgradePrompt } from '../../components/commerce/UpgradePrompt';
import { UsageLimitModal } from '../../components/commerce/UsageLimitModal';
import { GuestGate, SongGenerationSection } from '../../components/music/MusicGeneration';
import { UnifiedSongPreferences } from '../../components/shared/UnifiedSongPreferences';
import { FeedbackPrompt } from '../../components/shared/FeedbackPrompt';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { LoadingState } from '../../components/shared';
import { spacing } from '../../theme/spacing';
import { useAuthStore } from '../../auth/store';
import { logger } from '../../lib/logger';
import { useTranslation } from '../../i18n';
import { useSubscriptionData } from '../../contexts/SubscriptionContext';
import { TIER_IDS } from '@aiponge/shared-contracts';

import { useCreateScreenParams } from './create-screen/useCreateScreenParams';
import { useGenerationLifecycle } from './create-screen/useGenerationLifecycle';
import { useTrackManagement } from './create-screen/useTrackManagement';
import { EntryTracksList } from './create-screen/EntryTracksList';
import { MusicPlayerCard } from './create-screen/MusicPlayerCard';

const KEYBOARD_AVOIDANCE_PADDING = 400;

export function CreateScreen() {
  const colors = useThemeColors();
  const styles = React.useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const userId = useAuthStore(state => state.user?.id);
  const userRole = useAuthStore(state => state.user?.role);
  const musicPath = userRole === 'librarian' ? '/(librarian)/music' : '/(user)/music';

  const params = useCreateScreenParams();

  const [pictureContext, setPictureContext] = React.useState('');
  const [currentEntryContent, setCurrentEntryContent] = React.useState('');
  const [currentEmotionalState, setCurrentEmotionalState] = React.useState<0 | 1 | 2>(1);

  const { currentTier } = useSubscriptionData();
  const isGuest = currentTier === TIER_IDS.GUEST;

  const { checkFeatureSync, usage } = useUsageTracking();
  const [showUpgradePrompt, setShowUpgradePrompt] = React.useState(false);
  const [upgradePromptConfig, setUpgradePromptConfig] = React.useState({
    feature: 'songs',
    current: 0,
    limit: 0,
  });

  const {
    isGuest: isGuestUser,
    showPrompt: showGuestPrompt,
    promptContent: guestPromptContent,
    trackSongCreated,
    trackEntryCreated,
    closePrompt: closeGuestPrompt,
  } = useGuestConversion();

  const {
    preferences,
    loading: preferencesLoading,
    handleMusicPreferencesChange,
    handleGenreChange,
    handleCulturalLanguagesChange,
    handleMoodChange,
    handleInstrumentsChange,
    handleVocalGenderChange,
    handleStyleWeightChange,
    handleNegativeTagsChange,
  } = useMusicPreferences(userId);

  const [preferencesExpanded, setPreferencesExpanded] = React.useState(false);
  const [songGenerationExpanded, setSongGenerationExpanded] = React.useState(true);
  const [tracksExpanded, setTracksExpanded] = React.useState(false);

  const {
    entries,
    selectedEntry,
    selectedEntryId,
    generatedLyrics,
    lastGeneratedTrackId,
    entryTracks,
    songGenerationProgress,
    usageLimitModal,
    isLoadingEntries,
    isGeneratingSong,
    updateEntryContext,
    setEntryContext,
    clearGeneratedContent,
    setUsageLimitModal,
    refetchEntries,
    generateSong,
  } = useMusicGeneration();

  // Skip the books→chapters waterfall when source content is already in params — it's not needed
  const { chapters, loading: chaptersLoading } = useAllChapters({ enabled: !params.isSourceMode });
  // In source mode the entry is provided via params, so we're always ready immediately
  const isDataReady = params.isSourceMode || (!chaptersLoading && !isLoadingEntries);

  const accessibleEntries = React.useMemo(() => {
    if (!entries) return [];
    if (chaptersLoading) return entries.filter(entry => !entry.chapterId);
    if (chapters.length === 0) return entries;
    const lockedChapterIds = new Set(chapters.filter(ch => ch.isLocked).map(ch => ch.id));
    return entries.filter(entry => {
      if (!entry.chapterId) return true;
      return !lockedChapterIds.has(entry.chapterId);
    });
  }, [entries, chapters, chaptersLoading]);

  const generatedTrack = React.useMemo(() => {
    if (!lastGeneratedTrackId) return null;
    const track = entryTracks.find((t: { id: string }) => t.id === lastGeneratedTrackId);
    return track || null;
  }, [lastGeneratedTrackId, entryTracks]);

  const { balance, creditCostPerSong } = useCredits();

  const lifecycle = useGenerationLifecycle({
    sharedContent: params.sharedContent,
    entryId: params.entryId,
    isDataReady,
    entries,
    accessibleEntries,
    chapters,
    generatedTrack,
    isGeneratingSong,
    isGuestUser,
    trackSongCreated,
    setEntryContext,
    setSongGenerationExpanded,
    t,
  });

  const trackMgmt = useTrackManagement({
    userId,
    entryTracks,
    currentTrackId: lifecycle.currentTrack?.id,
    isPlaying: lifecycle.isPlaying,
  });

  React.useEffect(() => {
    if (params.sharedContent && !lifecycle.sharedContentProcessed) {
      setCurrentEntryContent(params.sharedContent);
    }
  }, [params.sharedContent, lifecycle.sharedContentProcessed]);

  const handleEntryContentChange = React.useCallback(
    (content: string) => {
      setCurrentEntryContent(content);
      if (content.trim()) {
        updateEntryContext({ content });
      } else {
        setEntryContext({ content: '', id: null, chapterId: null, artworkUrl: null });
        clearGeneratedContent();
      }
    },
    [updateEntryContext, setEntryContext, clearGeneratedContent]
  );

  const handleCurrentEntryChange = React.useCallback(
    (entry: Entry | null) => {
      if (entry?.emotionalState !== undefined) {
        setCurrentEmotionalState(entry.emotionalState as 0 | 1 | 2);
      } else {
        setCurrentEmotionalState(1);
      }
      const illustrationUrl = entry?.illustrations?.[0]?.url || entry?.illustrationUrl || null;
      updateEntryContext({ artworkUrl: illustrationUrl });
    },
    [updateEntryContext]
  );

  const handleEntrySelect = (entry: Entry) => {
    const illustrationUrl = entry.illustrations?.[0]?.url || entry.illustrationUrl || null;
    setEntryContext({
      content: entry.content,
      id: entry.id,
      chapterId: entry.chapterId || null,
      artworkUrl: illustrationUrl,
    });
    setCurrentEntryContent(entry.content);
  };

  const handleEntriesUpdate = async () => {
    await refetchEntries();
  };

  const handleImageLongPress = React.useCallback((imageUri: string) => {
    router.setParams({ pictureUri: encodeURIComponent(imageUri) });
  }, []);

  const handleGenerateSong = () => {
    const songCheck = checkFeatureSync('songs');
    if (!songCheck.allowed) {
      setUpgradePromptConfig({
        feature: 'songs',
        current: usage?.songs.current || 0,
        limit: usage?.songs.limit || 2,
      });
      setShowUpgradePrompt(true);
      return;
    }

    lifecycle.setGenerationPhase('song');
    const languageParam = preferences.culturalLanguages.length > 0 ? preferences.culturalLanguages : undefined;

    const generationOptions: {
      onGenerationStart: () => void;
      artworkUrl?: string;
      pictureContext?: string;
      sourceEntryId?: string;
      sourceText?: string;
      sourceReference?: string;
      sourceBookTitle?: string;
      styleWeight?: number;
      negativeTags?: string;
      vocalGender?: 'f' | 'm' | null;
      instruments?: string[];
      genre?: string;
    } = {
      onGenerationStart: () => {
        router.push(musicPath as Href);
      },
    };

    if (params.isSourceMode && params.sourceEntryId && params.decodedSourceText) {
      generationOptions.sourceEntryId = params.sourceEntryId;
      generationOptions.sourceText = params.decodedSourceText;
      if (params.decodedSourceReference) generationOptions.sourceReference = params.decodedSourceReference;
      if (params.decodedSourceBookTitle) generationOptions.sourceBookTitle = params.decodedSourceBookTitle;
    }

    generationOptions.styleWeight = preferences.styleWeight;
    generationOptions.negativeTags = preferences.negativeTags;
    generationOptions.vocalGender = preferences.vocalGender;
    generationOptions.instruments = preferences.instruments;
    generationOptions.genre = preferences.genre;

    generateSong(languageParam, generationOptions);
  };

  const creditsLoading = balance === null || !creditCostPerSong;
  const insufficientCredits = !creditsLoading && balance!.currentBalance < creditCostPerSong;
  const canGenerate =
    !isGeneratingSong && lifecycle.generationPhase === 'idle' && !insufficientCredits && !creditsLoading;

  const guestHasCredits = balance && balance.currentBalance > 0;
  const shouldShowGuestGate = isGuest && !guestHasCredits && !creditsLoading;

  if (shouldShowGuestGate) {
    return <GuestGate />;
  }

  if (isGuest && creditsLoading) {
    return <LoadingState />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']} testID="music-generation-page">
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollContainer}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {params.isPictureMode && (
            <View style={styles.pictureModeContainer}>
              <View style={styles.pictureHeader}>
                <Ionicons name="image" size={20} color={colors.brand.primary} />
                <Text style={styles.pictureHeaderText}>{t('create.pictureToSong')}</Text>
              </View>
              <View style={styles.picturePreviewContainer}>
                <Image source={{ uri: params.decodedPictureUri! }} style={styles.picturePreview} resizeMode="cover" />
              </View>
              <TextInput
                style={styles.pictureContextInput}
                value={pictureContext}
                onChangeText={setPictureContext}
                placeholder={t('create.pictureContextPlaceholder')}
                placeholderTextColor={colors.text.tertiary}
                multiline
                maxLength={500}
              />
              <Text style={styles.pictureHint}>{t('create.pictureHint')}</Text>

              <TouchableOpacity
                style={[
                  styles.pictureGenerateButton,
                  (!canGenerate || isGeneratingSong) && styles.pictureGenerateButtonDisabled,
                ]}
                onPress={() => {
                  if (!canGenerate || isGeneratingSong) return;

                  if (!params.decodedPictureUri) {
                    logger.error('[CreateScreen] decodedPictureUri is falsy', undefined, {
                      pictureUri: params.pictureUri,
                      decodedPictureUri: params.decodedPictureUri,
                    });
                    return;
                  }

                  logger.debug('[CreateScreen] Generating song from picture', {
                    artworkUrl: params.decodedPictureUri,
                    artworkUrlLength: params.decodedPictureUri.length,
                    pictureContext,
                    hasImage: !!params.decodedPictureUri,
                  });

                  const languageParam =
                    preferences.culturalLanguages.length > 0 ? preferences.culturalLanguages : undefined;
                  generateSong(languageParam, {
                    artworkUrl: params.decodedPictureUri,
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
                }}
                disabled={!canGenerate || isGeneratingSong}
              >
                {isGeneratingSong ? (
                  <ActivityIndicator size="small" color={colors.brand.primary} />
                ) : (
                  <>
                    <Ionicons name="musical-notes" size={20} color={colors.background.primary} />
                    <Text style={styles.pictureGenerateButtonText}>{t('create.generateFromPicture')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {params.isSourceMode && (
            <View style={styles.sourceModeContainer}>
              <View style={styles.sourceHeader}>
                <Ionicons name="book" size={20} color={colors.brand.accent} />
                <Text style={styles.sourceHeaderText}>{t('create.sourceToSong')}</Text>
              </View>
              {params.decodedSourceBookTitle ? (
                <Text style={styles.sourceBookTitle}>{params.decodedSourceBookTitle}</Text>
              ) : null}
              <ScrollView style={styles.sourceContentScroll} nestedScrollEnabled>
                <Text style={styles.sourceEntryText}>{params.decodedSourceText}</Text>
                {params.decodedSourceReference ? (
                  <Text style={styles.sourceReference}>— {params.decodedSourceReference}</Text>
                ) : null}
              </ScrollView>
              <Text style={styles.sourceHint}>{t('create.sourceHint')}</Text>

              <TouchableOpacity
                style={[
                  styles.sourceGenerateButton,
                  (!canGenerate || isGeneratingSong) && styles.sourceGenerateButtonDisabled,
                ]}
                onPress={handleGenerateSong}
                disabled={!canGenerate || isGeneratingSong}
                testID="button-generate-from-source"
              >
                {isGeneratingSong ? (
                  <ActivityIndicator size="small" color={colors.brand.primary} />
                ) : (
                  <>
                    <Ionicons name="musical-notes" size={20} color={colors.background.primary} />
                    <Text style={styles.sourceGenerateButtonText}>{t('create.generateFromSource')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {!params.isPictureMode && !params.isSourceMode && (
            <SongGenerationSection
              entries={accessibleEntries}
              totalEntries={accessibleEntries.length}
              selectedEntry={selectedEntry}
              selectedEntryId={selectedEntryId}
              currentEntryContent={currentEntryContent}
              isLoadingEntries={isLoadingEntries || chaptersLoading}
              onEntrySelect={handleEntrySelect}
              onEntriesUpdate={handleEntriesUpdate}
              onContentChange={handleEntryContentChange}
              onCurrentEntryChange={handleCurrentEntryChange}
              onEntryCreated={trackEntryCreated}
              onGenerateSong={handleGenerateSong}
              canGenerate={canGenerate}
              insufficientCredits={insufficientCredits}
              creditCost={creditCostPerSong ?? undefined}
              currentBalance={balance?.currentBalance ?? 0}
              creditsLoading={creditsLoading}
              onGetMoreCredits={() => router.push('/store')}
              expanded={songGenerationExpanded}
              onToggleExpand={() => setSongGenerationExpanded(!songGenerationExpanded)}
              navigateToEntryId={lifecycle.navigateToEntryId}
              onNavigatedToEntry={lifecycle.handleNavigatedToEntry}
              onImageLongPress={handleImageLongPress}
            />
          )}

          {!params.isPictureMode && !preferencesExpanded && (
            <View style={styles.preferencesGenerateRow}>
              <TouchableOpacity
                style={styles.compactPreferencesButton}
                onPress={() => setPreferencesExpanded(true)}
                testID="button-expand-preferences"
              >
                <Ionicons name="options-outline" size={18} color={colors.text.secondary} />
                <Text style={styles.compactPreferencesText}>{t('create.songPreferences')}</Text>
                <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
              </TouchableOpacity>

              {selectedEntry &&
                currentEntryContent.trim().length > 0 &&
                lifecycle.generationPhase === 'idle' &&
                songGenerationProgress === 0 && (
                  <TouchableOpacity
                    style={[styles.compactGenerateButton, !canGenerate && styles.generateSongButtonDisabled]}
                    onPress={handleGenerateSong}
                    disabled={!canGenerate}
                    testID="button-generate-song-main"
                  >
                    <Ionicons name="musical-notes" size={18} color={colors.text.primary} />
                    <Text style={styles.compactGenerateButtonText}>{t('create.generateSong')}</Text>
                  </TouchableOpacity>
                )}
            </View>
          )}

          {preferencesExpanded && (
            <UnifiedSongPreferences
              mode="collapsed"
              controlled={true}
              controlledPreferences={preferences}
              controlledLoading={preferencesLoading}
              expanded={preferencesExpanded}
              onToggleExpand={() => setPreferencesExpanded(!preferencesExpanded)}
              onMusicStylesChange={handleMusicPreferencesChange}
              onGenreChange={handleGenreChange}
              onCulturalLanguagesChange={handleCulturalLanguagesChange}
              onMoodChange={handleMoodChange}
              onInstrumentsChange={handleInstrumentsChange}
              onVocalGenderChange={handleVocalGenderChange}
              showStyleIntensity={true}
              styleWeight={preferences.styleWeight}
              onStyleWeightChange={handleStyleWeightChange}
              showNegativeTags={true}
              negativeTags={preferences.negativeTags}
              onNegativeTagsChange={handleNegativeTagsChange}
            />
          )}

          {!params.isPictureMode &&
            preferencesExpanded &&
            selectedEntry &&
            currentEntryContent.trim().length > 0 &&
            lifecycle.generationPhase === 'idle' &&
            songGenerationProgress === 0 && (
              <TouchableOpacity
                style={[styles.generateSongButton, !canGenerate && styles.generateSongButtonDisabled]}
                onPress={handleGenerateSong}
                disabled={!canGenerate}
                testID="button-generate-song-expanded"
              >
                <Ionicons name="musical-notes" size={20} color={colors.text.primary} />
                <Text style={styles.generateSongButtonText}>
                  {isGeneratingSong ? t('create.generatingSong') : t('create.generateSong')}
                </Text>
              </TouchableOpacity>
            )}

          <MusicPlayerCard
            generatedLyrics={generatedLyrics}
            generatedTrack={generatedTrack}
            isGeneratingSong={isGeneratingSong}
            songGenerationProgress={songGenerationProgress}
            currentTrackId={lifecycle.currentTrack?.id}
            isPlaying={lifecycle.isPlaying}
            onPlay={trackMgmt.handleGeneratedTrackPlay}
          />

          {lifecycle.showFeedbackPrompt && generatedTrack?.id && (
            <FeedbackPrompt
              trackId={generatedTrack.id}
              onFeedbackSubmitted={lifecycle.handleFeedbackSubmitted}
              onDismiss={lifecycle.handleFeedbackDismiss}
              visible={lifecycle.showFeedbackPrompt}
            />
          )}

          <EntryTracksList
            selectedEntry={selectedEntry}
            entryTracks={entryTracks}
            currentTrackId={lifecycle.currentTrack?.id}
            isPlaying={lifecycle.isPlaying}
            tracksExpanded={tracksExpanded}
            onToggleExpand={() => setTracksExpanded(!tracksExpanded)}
            onTrackPlayPause={trackMgmt.handleTrackPlayPause}
            selectedTrackForMenu={trackMgmt.selectedTrackForMenu}
            onSelectTrackForMenu={trackMgmt.setSelectedTrackForMenu}
            getMenuPropsForTrack={trackMgmt.getMenuPropsForTrack}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <UpgradePrompt
        visible={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
        feature={upgradePromptConfig.feature}
        currentUsage={upgradePromptConfig.current}
        limit={upgradePromptConfig.limit}
      />

      <UsageLimitModal
        visible={usageLimitModal.visible}
        onClose={() => setUsageLimitModal({ visible: false })}
        onUpgrade={() => {
          setUsageLimitModal({ visible: false });
          router.push('/paywall');
        }}
        limitType="songs"
        limit={usageLimitModal.limit}
        resetDate={usageLimitModal.resetDate}
      />

      {showGuestPrompt && guestPromptContent.title && (
        <GuestConversionPrompt
          visible={showGuestPrompt}
          onClose={closeGuestPrompt}
          title={guestPromptContent.title}
          message={guestPromptContent.message}
          triggerAction={guestPromptContent.triggerAction}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    keyboardAvoid: commonStyles.flexOne,
    scrollContainer: commonStyles.flexOne,
    contentContainer: {
      flexGrow: 1,
      paddingBottom: KEYBOARD_AVOIDANCE_PADDING,
    },
    preferencesGenerateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginHorizontal: spacing.screenHorizontal,
      marginTop: spacing.componentGap,
      gap: spacing.componentGap,
    },
    compactPreferencesButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: 10,
      height: 48,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border.primary,
      gap: 6,
    },
    compactPreferencesText: {
      color: colors.text.secondary,
      fontSize: 14,
      fontWeight: '500',
    },
    compactGenerateButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand.primary,
      borderRadius: 10,
      height: 48,
      paddingHorizontal: 16,
      gap: 6,
    },
    compactGenerateButtonText: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: '600',
    },
    generateSongButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 16,
      paddingHorizontal: 24,
      marginHorizontal: spacing.screenHorizontal,
      marginTop: spacing.sectionGap,
      gap: 8,
    },
    generateSongButtonDisabled: {
      opacity: 0.4,
    },
    generateSongButtonText: {
      color: colors.text.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    pictureModeContainer: {
      marginHorizontal: spacing.screenHorizontal,
      marginVertical: spacing.sectionGap,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.lg,
      padding: spacing.elementPadding,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    pictureHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    pictureHeaderText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    picturePreviewContainer: {
      borderRadius: BORDER_RADIUS.md,
      overflow: 'hidden',
      marginBottom: 12,
    },
    picturePreview: {
      width: '100%',
      height: Dimensions.get('window').width * 0.5,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.tertiary,
    },
    pictureContextInput: {
      backgroundColor: colors.background.tertiary,
      borderRadius: BORDER_RADIUS.sm,
      padding: 12,
      color: colors.text.primary,
      fontSize: 14,
      minHeight: 60,
      textAlignVertical: 'top',
      marginBottom: 8,
    },
    pictureHint: {
      fontSize: 12,
      color: colors.text.tertiary,
      fontStyle: 'italic',
    },
    pictureGenerateButton: {
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
    pictureGenerateButtonDisabled: {
      opacity: 0.5,
    },
    pictureGenerateButtonText: {
      color: colors.background.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    sourceModeContainer: {
      marginHorizontal: spacing.screenHorizontal,
      marginVertical: spacing.sectionGap,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.lg,
      padding: spacing.elementPadding,
      borderWidth: 1,
      borderColor: colors.brand.accent + '40',
    },
    sourceHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    sourceHeaderText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    sourceBookTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.brand.accent,
      marginBottom: 12,
    },
    sourceContentScroll: {
      maxHeight: 200,
      marginBottom: 12,
    },
    sourceEntryText: {
      fontSize: 15,
      lineHeight: 24,
      color: colors.text.primary,
      fontStyle: 'italic',
    },
    sourceReference: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginTop: 12,
      textAlign: 'right',
    },
    sourceHint: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginBottom: 16,
    },
    sourceGenerateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand.accent,
      borderRadius: BORDER_RADIUS.md,
      padding: spacing.elementPadding,
      gap: 8,
    },
    sourceGenerateButtonDisabled: {
      opacity: 0.5,
    },
    sourceGenerateButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.background.primary,
    },
  });

export default CreateScreen;
