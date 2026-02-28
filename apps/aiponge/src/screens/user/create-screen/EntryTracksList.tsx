import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../../theme';
import { spacing } from '../../../theme/spacing';
import { useTranslation } from '../../../i18n';
import { ArtworkImage } from '../../../components/music/ArtworkImage';
import { MoreOptionsButton } from '../../../components/shared/TrackComponents';
import { TrackOptionsMenu, type TrackForMenu } from '../../../components/music/TrackOptionsMenu';
interface EntryTracksListProps {
  selectedEntry: string | null;
  entryTracks: Array<{
    id: string;
    title?: string | null;
    displayName?: string | null;
    audioUrl?: string;
    artworkUrl?: string | null;
    lyricsId?: string;
  }>;
  currentTrackId: string | undefined;
  isPlaying: boolean;
  tracksExpanded: boolean;
  onToggleExpand: () => void;
  onTrackPlayPause: (track: {
    id: string;
    title?: string | null;
    displayName?: string | null;
    audioUrl?: string;
    artworkUrl?: string | null;
  }) => void;
  selectedTrackForMenu: TrackForMenu | null;
  onSelectTrackForMenu: (track: TrackForMenu | null) => void;
  getMenuPropsForTrack: (track: TrackForMenu) =>
    | Record<string, unknown>
    | {
        isFavorite: boolean;
        showEditOption: boolean;
        onToggleFavorite?: () => void;
        onShowLyrics?: () => void;
        onRemoveFromLibrary?: () => void;
        onTrackUpdated?: () => void;
      };
}

export function EntryTracksList({
  selectedEntry,
  entryTracks,
  currentTrackId,
  isPlaying,
  tracksExpanded,
  onToggleExpand,
  onTrackPlayPause,
  selectedTrackForMenu,
  onSelectTrackForMenu,
  getMenuPropsForTrack,
}: EntryTracksListProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  if (!selectedEntry || entryTracks.length === 0) return null;

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.header} onPress={onToggleExpand} testID="button-toggle-tracks">
        <Text style={styles.title}>{t('create.songsFromEntry', { count: entryTracks.length })}</Text>
        <Ionicons name={tracksExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.text.secondary} />
      </TouchableOpacity>

      {tracksExpanded && (
        <View style={styles.list}>
          {entryTracks.map(track => {
            const isCurrentlyPlaying = currentTrackId === track.id && isPlaying;

            const trackForMenu: TrackForMenu = {
              id: track.id,
              title: track.title || t('create.untitledSong'),
              displayName: track.displayName || t('create.you'),
              lyricsId: 'lyricsId' in track ? (track as { lyricsId?: string }).lyricsId : undefined,
              isUserGenerated: true,
            };

            return (
              <View key={track.id} style={styles.item} testID={`entry-track-${track.id}`}>
                <ArtworkImage uri={track.artworkUrl} size={40} borderRadius={6} testID={`artwork-${track.id}`} />
                <View style={styles.details}>
                  <Text style={[styles.itemTitle, isCurrentlyPlaying && styles.itemTitleActive]} numberOfLines={1}>
                    {track.title || t('create.untitledSong')}
                  </Text>
                  <Text style={styles.itemArtist} numberOfLines={1}>
                    {track.displayName || t('create.you')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.playButton, isCurrentlyPlaying && styles.playButtonActive]}
                  onPress={() => onTrackPlayPause(track)}
                  testID={`button-play-${track.id}`}
                  disabled={!track.audioUrl}
                >
                  <Ionicons
                    name={isCurrentlyPlaying ? 'pause' : 'play'}
                    size={16}
                    color={isCurrentlyPlaying ? colors.brand.primary : colors.text.secondary}
                  />
                </TouchableOpacity>
                <MoreOptionsButton
                  onPress={() => onSelectTrackForMenu(trackForMenu)}
                  testID={`button-more-${track.id}`}
                  size={18}
                  color={colors.text.secondary}
                  style={styles.moreButton}
                />
              </View>
            );
          })}
        </View>
      )}

      {selectedTrackForMenu && (
        <TrackOptionsMenu
          visible={!!selectedTrackForMenu}
          onClose={() => onSelectTrackForMenu(null)}
          track={selectedTrackForMenu}
          {...getMenuPropsForTrack(selectedTrackForMenu)}
        />
      )}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: spacing.screenHorizontal,
      paddingVertical: 2,
      backgroundColor: colors.background.primary,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.sectionGap,
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
    },
    list: {
      gap: spacing.componentGap,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: spacing.sectionGap,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    details: {
      flex: 1,
      marginRight: spacing.sectionGap,
    },
    itemTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 2,
    },
    itemTitleActive: {
      color: colors.brand.primary,
    },
    itemArtist: {
      fontSize: 14,
      color: colors.text.secondary,
    },
    playButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.state.hover,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    playButtonActive: {
      backgroundColor: colors.brand.primary + '20',
      borderColor: colors.brand.primary,
    },
    moreButton: {
      marginLeft: 8,
    },
  });
