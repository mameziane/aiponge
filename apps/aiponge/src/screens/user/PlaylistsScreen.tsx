import { useState, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { LoadingState } from '../../components/shared/LoadingState';
import { ErrorState } from '../../components/shared/ErrorState';
import { EmptyState } from '../../components/shared/EmptyState';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMyMusicPlaylists, MyPlaylist } from '../../hooks/playlists/useMyMusicPlaylists';
import { useSmartPlaylists } from '../../hooks/playlists/useSmartPlaylists';
import { usePlaylistMutations } from '../../hooks/playlists/usePlaylistMutations';
import { PlaylistCard } from '../../components/playlists/PlaylistCard';
import { CreatePlaylistModal } from '../../components/playlists/CreatePlaylistModal';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { useTranslation } from '../../i18n';
import type { SmartPlaylist } from '../../types/playlist.types';
import { usePlaylistTrackNavigation } from '../../hooks/music/usePlaylistTrackNavigation';

const CARD_SIZE = 160;
const CARD_GAP = 16;

export function PlaylistsScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { playlists, isLoadingPlaylists, isPlaylistsError } = useMyMusicPlaylists();
  const { smartPlaylists, isLoading: isLoadingSmartPlaylists } = useSmartPlaylists();
  const { createPlaylist } = usePlaylistMutations();

  const [showCreateModal, setShowCreateModal] = useState(false);

  const {
    handleNextTrack,
    handlePreviousTrack,
    handleTogglePlayPause,
    shuffleEnabled,
    repeatMode,
    toggleShuffle,
    cycleRepeat,
    hasNext,
    hasPrevious,
    trackCount,
    currentTrack,
    isPlaying,
  } = usePlaylistTrackNavigation({ logPrefix: '[Playlists]' });

  const handlePlaylistPress = (playlist: MyPlaylist) => {
    router.push({
      pathname: '/music-library',
      params: { selectPlaylist: playlist.id },
    });
  };

  const handleSmartPlaylistPress = (playlist: SmartPlaylist) => {
    router.push({
      pathname: '/music-library',
      params: { selectPlaylist: playlist.id, smartKey: playlist.smartKey },
    });
  };

  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
  };

  const isLoading = isLoadingPlaylists || isLoadingSmartPlaylists;
  const hasSmartPlaylists = smartPlaylists.length > 0;
  const hasManualPlaylists = playlists.length > 0;
  const hasAnyContent = hasSmartPlaylists || hasManualPlaylists;

  if (isLoading) {
    return <LoadingState message={t('components.playlistsScreen.loadingPlaylists')} />;
  }

  if (isPlaylistsError) {
    return <ErrorState message={t('components.playlistsScreen.failedToLoad')} />;
  }

  if (!hasAnyContent) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="albums-outline"
          title={t('components.playlistsScreen.noPlaylistsYet')}
          description={t('components.playlistsScreen.createFirstPlaylist')}
          action={{
            label: t('library.createPlaylist'),
            onPress: handleOpenCreateModal,
            testID: 'button-create-first-playlist',
          }}
          testID="empty-playlists"
        />
        <CreatePlaylistModal
          visible={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreate={async ({ name, description }) => {
            await createPlaylist({ name, description });
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {hasSmartPlaylists && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('components.playlistsScreen.autoCollections')}</Text>
              <View style={styles.smartBadge}>
                <Ionicons name="sparkles" size={12} color={colors.brand.primary} />
                <Text style={styles.smartBadgeText}>{t('components.playlistsScreen.smart')}</Text>
              </View>
            </View>
            <Text style={styles.sectionSubtitle}>{t('components.playlistsScreen.autoOrganized')}</Text>
            <View style={styles.gridContainer}>
              <View style={styles.grid}>
                {smartPlaylists.map((playlist: SmartPlaylist) => (
                  <TouchableOpacity
                    key={playlist.id}
                    style={styles.smartCard}
                    onPress={() => handleSmartPlaylistPress(playlist)}
                    activeOpacity={0.8}
                    testID={`smart-playlist-${playlist.smartKey}`}
                  >
                    <View style={styles.smartArtworkContainer}>
                      <LinearGradient
                        colors={[playlist.color, `${playlist.color}99`, `${playlist.color}44`]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.smartArtworkGradient}
                      >
                        <View style={styles.smartIconWrapper}>
                          <Text style={styles.smartIcon}>{playlist.icon}</Text>
                        </View>
                        <View style={styles.smartArtworkPattern}>
                          <Ionicons
                            name="musical-notes"
                            size={60}
                            color="rgba(255,255,255,0.1)"
                            style={styles.patternIcon1}
                          />
                          <Ionicons
                            name="sparkles"
                            size={40}
                            color="rgba(255,255,255,0.08)"
                            style={styles.patternIcon2}
                          />
                        </View>
                      </LinearGradient>
                    </View>
                    <View style={styles.smartInfoContainer}>
                      <Text style={styles.smartCardTitle} numberOfLines={1}>
                        {playlist.name}
                      </Text>
                      <Text style={styles.smartCardCount}>
                        {t('components.playlistsScreen.track', { count: playlist.computedTrackCount })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {hasManualPlaylists && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('components.playlistsScreen.myPlaylists')}</Text>
            </View>
            <Text style={styles.sectionSubtitle}>
              {t('components.playlistsScreen.playlistCount', { count: playlists.length })}
            </Text>
            <View style={styles.gridContainer}>
              <View style={styles.grid}>
                {playlists.map((playlist: MyPlaylist) => (
                  <PlaylistCard
                    key={playlist.id}
                    id={playlist.id}
                    title={playlist.name}
                    description={playlist.description}
                    artworkUrl={playlist.artworkUrl}
                    totalTracks={playlist.totalTracks}
                    onPress={() => handlePlaylistPress(playlist)}
                    showMoreMenu={true}
                  />
                ))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={handleOpenCreateModal} activeOpacity={0.85}>
        <Ionicons name="add" size={28} color={colors.absolute.white} />
      </TouchableOpacity>

      <CreatePlaylistModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={async ({ name, description }) => {
          await createPlaylist({ name, description });
        }}
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
    scrollContent: {
      paddingBottom: 24,
    },
    section: {
      marginTop: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      gap: 8,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.primary,
    },
    sectionSubtitle: {
      fontSize: 13,
      color: colors.text.secondary,
      paddingHorizontal: 16,
      marginTop: 4,
      marginBottom: 12,
    },
    smartBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: `${colors.brand.primary}20`,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: BORDER_RADIUS.md,
      gap: 4,
    },
    smartBadgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.brand.primary,
    },
    smartCard: {
      width: CARD_SIZE,
    },
    smartArtworkContainer: {
      width: CARD_SIZE,
      height: CARD_SIZE,
      borderRadius: BORDER_RADIUS.sm,
      overflow: 'hidden',
      backgroundColor: colors.background.secondary,
    },
    smartArtworkGradient: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    smartIconWrapper: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    smartIcon: {
      fontSize: 36,
    },
    smartArtworkPattern: {
      position: 'absolute',
      width: '100%',
      height: '100%',
    },
    patternIcon1: {
      position: 'absolute',
      bottom: 12,
      right: 12,
    },
    patternIcon2: {
      position: 'absolute',
      top: 16,
      left: 16,
    },
    smartInfoContainer: {
      marginTop: 8,
    },
    smartCardTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 4,
    },
    smartCardCount: {
      fontSize: 12,
      color: colors.text.secondary,
    },
    gridContainer: {
      alignItems: 'center',
      paddingHorizontal: 16,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 16,
      maxWidth: 360,
      width: '100%',
    },
    fab: {
      position: 'absolute',
      right: 20,
      bottom: 24,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.brand.primary,
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 6,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
    },
  });

const styles = StyleSheet.create({});
