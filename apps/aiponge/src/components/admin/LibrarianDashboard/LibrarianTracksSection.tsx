import { useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TextInput, Alert, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { fontFamilies } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import { useSharedLibraryData } from '../../../hooks/playlists/useSharedLibraryData';
import { useSharedLibraryAdminActions } from '../../../hooks/playlists/useSharedLibraryAdminActions';
import { useTrackPlayback } from '../../../hooks/music/useTrackPlayback';
import { ArtworkImage } from '../../music/ArtworkImage';
import { AnimatedWaveform } from '../../music/AnimatedWaveform';
import { TrackOptionsMenu } from '../../music/TrackOptionsMenu';
import { MoreOptionsButton } from '../../shared/TrackComponents';
import { EmptyState } from '../../shared/EmptyState';
import { ErrorState } from '../../shared/ErrorState';
import type { SharedTrack } from '../../../types';

interface TrackCardProps {
  track: SharedTrack;
  index: number;
  playing: boolean;
  onPlay: () => void;
  onDelete: (id: string, title: string) => void;
  styles: ReturnType<typeof createStyles>;
  colors: ColorScheme;
}

function TrackCard({ track, index, playing, onPlay, onDelete, styles, colors }: TrackCardProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.trackCard, playing && styles.trackCardActive]}
        onPress={onPlay}
        activeOpacity={0.7}
        testID={`librarian-track-${index}`}
      >
        <ArtworkImage
          uri={track.artworkUrl}
          size={80}
          borderRadius={0}
          testID={`track-artwork-${index}`}
          fallbackIcon={<Ionicons name="musical-note" size={24} color={colors.text.tertiary} />}
        />
        <View style={styles.trackInfo}>
          <Text style={[styles.trackTitle, playing && styles.trackTitleActive]} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {track.displayName || ''}
          </Text>
          <View style={styles.trackMeta}>
            {track.playCount !== undefined && track.playCount > 0 && (
              <Text style={styles.trackPlays}>{track.playCount}</Text>
            )}
            {playing && <AnimatedWaveform size="small" color={colors.brand.primary} />}
          </View>
        </View>
        <MoreOptionsButton
          onPress={() => setShowMenu(true)}
          testID={`button-more-${track.id}`}
          style={styles.moreButton}
        />
      </TouchableOpacity>
      <TrackOptionsMenu
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        track={{
          id: track.id,
          title: track.title,
          displayName: track.displayName || '',
          artworkUrl: track.artworkUrl,
          audioUrl: track.audioUrl,
          duration: track.duration,
        }}
        onRemoveFromLibrary={() => onDelete(track.id, track.title)}
        showEditOption={false}
      />
    </>
  );
}

export function LibrarianTracksSection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const [searchQuery, setSearchQuery] = useState('');

  const tracksQueryKey = useMemo(
    () => ['/api/v1/app/library/shared', { search: searchQuery, genreFilter: '', languageFilter: '' }],
    [searchQuery]
  );

  const tracksEndpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (searchQuery) params.append('search', searchQuery);
    const qs = params.toString();
    return `/api/v1/app/library/shared${qs ? `?${qs}` : ''}`;
  }, [searchQuery]);

  const { tracks, total, isLoading, isError } = useSharedLibraryData({
    tracksQueryKey,
    tracksEndpoint,
    selectedPlaylistId: null,
    smartKey: null,
  });

  const { handleDeleteTrack } = useSharedLibraryAdminActions();

  const { currentTrack, isPlaying, handlePlayTrack } = useTrackPlayback<SharedTrack>({
    shuffleEnabled: false,
    repeatMode: 'off',
    availableTracks: tracks,
  });

  const onDeleteTrack = useCallback(
    (trackId: string, trackTitle: string) => {
      Alert.alert(
        t('common.confirmDelete') || 'Delete',
        t('librarian.tracks.deleteConfirm', { title: trackTitle }) ||
          `Are you sure you want to delete "${trackTitle}"?`,
        [
          { text: t('common.cancel') || 'Cancel', style: 'cancel' },
          {
            text: t('common.delete') || 'Delete',
            style: 'destructive',
            onPress: () => handleDeleteTrack(trackId),
          },
        ]
      );
    },
    [handleDeleteTrack, t]
  );

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  if (isError) {
    return <ErrorState message={t('common.errorLoading') || 'Failed to load'} fullScreen={false} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={colors.text.tertiary} />
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={t('librarian.tracks.searchPlaceholder') || 'Search tracks...'}
          placeholderTextColor={colors.text.tertiary}
        />
        {searchQuery.length > 0 && (
          <Ionicons name="close-circle" size={18} color={colors.text.tertiary} onPress={() => setSearchQuery('')} />
        )}
      </View>

      <View style={styles.header}>
        <Text style={styles.title}>{t('librarian.tracks.title') || 'Tracks'}</Text>
        <Text style={styles.count}>
          {total} {t('common.tracks') || 'tracks'}
        </Text>
      </View>

      {tracks.length === 0 ? (
        <EmptyState
          icon="musical-notes-outline"
          title={t('librarian.tracks.noTracks') || 'No tracks found'}
          description={
            t('librarian.tracks.noTracksHint') || 'Tracks will appear here once they are added to the shared library'
          }
        />
      ) : (
        <View style={styles.tracksGrid}>
          {tracks.map((track, index) => (
            <TrackCard
              key={track.id}
              track={track}
              index={index}
              playing={currentTrack?.id === track.id && isPlaying}
              onPlay={() => handlePlayTrack(track)}
              onDelete={onDeleteTrack}
              styles={styles}
              colors={colors}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      gap: 16,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.primary,
      padding: 0,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    title: {
      fontSize: 18,
      fontWeight: '600',
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.primary,
    },
    count: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 8,
    },
    tracksGrid: {
      gap: 12,
    },
    trackCard: {
      flexDirection: 'row',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    trackCardActive: {
      borderColor: colors.brand.primary,
    },
    trackInfo: {
      flex: 1,
      padding: 12,
      justifyContent: 'center',
      gap: 4,
    },
    trackTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
    },
    trackTitleActive: {
      color: colors.brand.primary,
    },
    trackArtist: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    trackMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    trackPlays: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    moreButton: {
      padding: 12,
      alignSelf: 'center',
    },
  });
