import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList, ScrollView, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { isContentPubliclyAccessible } from '@aiponge/shared-contracts';
import { useSharedLibrary, SharedTrack } from '../../hooks/playlists/useSharedLibrary';
import { useLyricsModal } from '../../hooks/music/useLyricsModal';
import { useFavorites } from '../../hooks/playlists/useFavorites';
import { useTrackListOptimization } from '../../hooks/music/useTrackListOptimization';
import { useTrackOptionsScreen } from '../../hooks/music/useTrackOptions';
import { useAuthStore, selectUserId } from '../../auth/store';
import { LyricsModal } from '../../components/music/LyricsModal';
import { TrackItem } from '../../components/music/TrackItem';
import { EmptyState } from '../../components/shared/EmptyState';
import { LanguageFilterRow } from '../../components/shared/LanguageFilterRow';
import { LoadingState } from '../../components/shared/LoadingState';
import { PlaylistDropdown } from '../../components/playlists/PlaylistDropdown';
import { PlaybackControls } from '../../components/music/PlaybackControls';
import { FollowPlaylistButton } from '../../components/playlists/FollowPlaylistButton';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { useTranslation } from '../../i18n';

export function PublicMusicScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const userId = useAuthStore(selectUserId);
  const { isFavorite, toggleFavorite } = useFavorites(userId || '');

  const {
    tracks,
    filteredTracks,
    total,
    allGenres,
    languageOptions,
    playlists,
    searchQuery,
    selectedGenre,
    selectedLanguage,
    selectedPlaylistId,
    currentTrack,
    isPlaying,
    isLoading,
    isFetching,
    isError,
    shuffleEnabled,
    repeatMode,
    handleToggleShuffle,
    handleCycleRepeat,
    handleNextTrack,
    handlePreviousTrack,
    handleTogglePlayPause,
    setSearchQuery,
    setSelectedGenre,
    setSelectedLanguage,
    setSelectedPlaylistId,
    handlePlayTrack,
    formatDuration,
    hasNoTracks,
    hasNoFilteredTracks,
    handleDeleteTrack,
  } = useSharedLibrary();

  const { lyricsModal, handleShowLyrics, handleCloseLyrics } = useLyricsModal();
  const { keyExtractor, getItemLayout, flatListProps } = useTrackListOptimization<SharedTrack>({
    showsVerticalScrollIndicator: true,
  });

  // Centralized track options (admin can delete tracks)
  const { getMenuPropsForTrack } = useTrackOptionsScreen<SharedTrack>('sharedLibrary', {
    handleShowLyrics,
    toggleFavorite,
    isFavorite,
    handleDeleteTrack,
  });

  const handleTrackTap = useCallback(
    (track: SharedTrack) => {
      handlePlayTrack(track);
    },
    [handlePlayTrack]
  );

  const handleTrackLongPress = useCallback(
    async (track: SharedTrack) => {
      if (currentTrack?.id !== track.id) {
        await handlePlayTrack(track);
      }
      router.push({
        pathname: '/private-track-detail',
        params: { track: JSON.stringify(track) },
      });
    },
    [currentTrack?.id, handlePlayTrack, router]
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, [setSearchQuery]);

  const handleSelectAllGenres = useCallback(() => {
    setSelectedGenre('');
  }, [setSelectedGenre]);

  const selectedPlaylist = useMemo(() => {
    if (!selectedPlaylistId) return null;
    return playlists.find((p: { id: string }) => p.id === selectedPlaylistId) || null;
  }, [selectedPlaylistId, playlists]);

  const showFollowButton = useMemo(() => {
    if (!selectedPlaylist || !userId) return false;
    return isContentPubliclyAccessible(selectedPlaylist.visibility || '') && selectedPlaylist.userId !== userId;
  }, [selectedPlaylist, userId]);

  const renderTrackItem = useCallback(
    ({ item: track }: { item: SharedTrack }) => {
      const menuProps = getMenuPropsForTrack(track);
      return (
        <TrackItem
          track={track}
          isActive={currentTrack?.id === track.id}
          isPlaying={isPlaying}
          onPress={() => handleTrackTap(track)}
          onLongPress={() => handleTrackLongPress(track)}
          formatDuration={formatDuration}
          {...menuProps}
        />
      );
    },
    [currentTrack?.id, isPlaying, handleTrackTap, handleTrackLongPress, formatDuration, getMenuPropsForTrack]
  );

  const ListHeaderComponent = useMemo(
    () => (
      <>
        <PlaylistDropdown
          playlists={playlists}
          selectedPlaylistId={selectedPlaylistId}
          allTracksCount={total}
          onSelectPlaylist={setSelectedPlaylistId}
          leadingAccessory={
            <TouchableOpacity
              onPress={handleBack}
              style={styles.backButton}
              testID="button-back-to-explore"
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
            >
              <Ionicons name="arrow-back" size={24} color={colors.brand.primary} />
            </TouchableOpacity>
          }
          trailingAccessory={
            showFollowButton && selectedPlaylistId ? (
              <FollowPlaylistButton playlistId={selectedPlaylistId} size="small" variant="outline" showCount={false} />
            ) : undefined
          }
        />

        <View style={styles.filtersContainer}>
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color={colors.text.tertiary} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('components.sharedLibrary.searchTracks')}
              placeholderTextColor={colors.text.tertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              testID="input-search"
              accessibilityLabel={t('components.sharedLibrary.searchTracks')}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={handleClearSearch}
                testID="button-clear-search"
                accessibilityRole="button"
                accessibilityLabel={t('common.clear')}
              >
                <Ionicons name="close-circle" size={20} color={colors.text.tertiary} />
              </TouchableOpacity>
            )}
          </View>

          {allGenres.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.genreFilterScroll}>
              <TouchableOpacity
                style={[styles.genreFilterChip, !selectedGenre && styles.genreFilterChipActive]}
                onPress={handleSelectAllGenres}
                testID="button-genre-all"
                accessibilityRole="button"
                accessibilityLabel={t('common.all')}
                accessibilityState={{ selected: !selectedGenre }}
              >
                <Text style={[styles.genreFilterText, !selectedGenre && styles.genreFilterTextActive]}>
                  {t('common.all')}
                </Text>
              </TouchableOpacity>
              {allGenres.map(genre => (
                <TouchableOpacity
                  key={genre}
                  style={[styles.genreFilterChip, selectedGenre === genre && styles.genreFilterChipActive]}
                  onPress={() => setSelectedGenre(genre)}
                  testID={`button-genre-${genre.toLowerCase()}`}
                  accessibilityRole="button"
                  accessibilityLabel={genre}
                  accessibilityState={{ selected: selectedGenre === genre }}
                >
                  <Text style={[styles.genreFilterText, selectedGenre === genre && styles.genreFilterTextActive]}>
                    {genre}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {languageOptions.length > 0 && (
            <LanguageFilterRow
              selectedLanguage={selectedLanguage}
              onSelectLanguage={setSelectedLanguage}
              languages={languageOptions}
              testIdPrefix="button-language"
            />
          )}
        </View>
      </>
    ),
    [
      playlists,
      selectedPlaylistId,
      total,
      setSelectedPlaylistId,
      handleBack,
      t,
      searchQuery,
      setSearchQuery,
      handleClearSearch,
      allGenres,
      selectedGenre,
      handleSelectAllGenres,
      languageOptions,
      selectedLanguage,
      setSelectedLanguage,
      showFollowButton,
    ]
  );

  const ListEmptyComponent = useMemo(() => {
    if (isLoading) {
      return <LoadingState message={t('components.sharedLibrary.loadingMusic')} fullScreen={false} />;
    }
    if (isError) {
      return (
        <EmptyState
          icon="musical-notes"
          title={t('components.sharedLibrary.failedToLoad')}
          description={t('components.sharedLibrary.checkConnection')}
          testID="error"
        />
      );
    }
    if (tracks.length === 0) {
      return (
        <EmptyState
          icon="library"
          title={t('components.sharedLibrary.noTracksYet')}
          description={t('components.sharedLibrary.musicComingSoon')}
          testID="empty"
        />
      );
    }
    if (hasNoFilteredTracks) {
      return (
        <EmptyState
          icon="search"
          title={t('components.sharedLibrary.noMatchingTracks')}
          description={t('components.sharedLibrary.tryDifferentFilters')}
          testID="no-results"
        />
      );
    }
    return null;
  }, [isLoading, isError, tracks.length, hasNoFilteredTracks, t]);

  return (
    <View style={styles.container} testID="shared-library-page">
      <PlaybackControls
        shuffleEnabled={shuffleEnabled}
        repeatMode={repeatMode}
        onToggleShuffle={handleToggleShuffle}
        onCycleRepeat={handleCycleRepeat}
        onPrevious={handlePreviousTrack}
        onNext={handleNextTrack}
        onPlayPause={handleTogglePlayPause}
        isPlaying={isPlaying}
        trackCount={total}
      />

      <FlatList
        data={filteredTracks}
        renderItem={renderTrackItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={styles.contentContainer}
        style={isFetching && !isLoading ? { opacity: 0.6 } : undefined}
        testID="track-list"
        {...flatListProps}
      />

      <LyricsModal
        visible={lyricsModal.visible}
        onClose={handleCloseLyrics}
        lyricsId={lyricsModal.lyricsId}
        trackTitle={lyricsModal.trackTitle}
      />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    contentContainer: {
      paddingBottom: 20,
    },
    backButton: {
      padding: 8,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 16,
    },
    titleSection: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    titleIcon: {
      marginRight: 12,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text.primary,
    },
    subtitle: {
      fontSize: 14,
      color: colors.text.tertiary,
      marginBottom: 16,
      lineHeight: 20,
    },
    statsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border.muted,
      gap: 12,
    },
    statsText: {
      fontSize: 16,
      color: colors.text.primary,
      fontWeight: '600',
    },
    trackListContainer: {
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    emptyIconContainer: {
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 8,
    },
    trackList: {
      gap: 12,
    },
    playlistSelectorContainer: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    playlistDropdown: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background.primary,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    playlistDropdownLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 12,
    },
    playlistDropdownTextContainer: {
      flex: 1,
    },
    playlistDropdownLabel: {
      fontSize: 11,
      color: colors.text.tertiary,
      marginBottom: 2,
      fontWeight: '500',
    },
    playlistDropdownValue: {
      fontSize: 15,
      color: colors.text.primary,
      fontWeight: '600',
    },
    filtersContainer: {
      gap: 12,
      marginBottom: 16,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 16,
      paddingVertical: 12,
      gap: 8,
    },
    searchIcon: {
      opacity: 0.6,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text.primary,
      padding: 0,
    },
    genreFilterScroll: {
      flexGrow: 0,
    },
    genreFilterChip: {
      backgroundColor: colors.background.secondary,
      borderRadius: 20,
      paddingHorizontal: 16,
      paddingVertical: 8,
      marginRight: 8,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    genreFilterChipActive: {
      backgroundColor: colors.brand.primary,
      borderColor: colors.brand.primary,
    },
    genreFilterText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.tertiary,
    },
    genreFilterTextActive: {
      color: colors.text.primary,
    },
    playlistDropdownRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    playlistCountBadge: {
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 10,
      paddingVertical: 4,
      minWidth: 32,
      alignItems: 'center',
    },
    playlistCountText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text.primary,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay.dark,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background.secondary,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '80%',
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border.muted,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
    },
    modalCloseButton: {
      padding: 4,
    },
    playlistOptions: {
      paddingVertical: 8,
    },
    playlistOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    playlistOptionActive: {
      backgroundColor: colors.background.subtle,
    },
    playlistOptionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 12,
    },
    playlistOptionText: {
      flex: 1,
    },
    playlistOptionName: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    playlistOptionNameActive: {
      color: colors.brand.primary,
    },
    playlistOptionDescription: {
      fontSize: 13,
      color: colors.text.tertiary,
      lineHeight: 18,
    },
    playlistOptionBadge: {
      backgroundColor: colors.state.hover,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 10,
      paddingVertical: 4,
      minWidth: 32,
      alignItems: 'center',
      marginLeft: 12,
    },
    playlistOptionCount: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.brand.primary,
    },
  });

const styles = StyleSheet.create({});

// Default export for Expo Router compatibility
export default PublicMusicScreen;
