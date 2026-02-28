import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  FlatList,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { fontFamilies } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import { LiquidGlassCard } from '../../ui';
import { LoadingState } from '../../shared';
import { EmptyState } from '../../shared/EmptyState';
import { PlaylistArtwork } from '../../playlists/PlaylistArtwork';
import { usePlaylistMutations } from '../../../hooks/playlists/usePlaylistMutations';
import { useMyMusicPlaylists, type MyPlaylist } from '../../../hooks/playlists/useMyMusicPlaylists';
import { useSharedLibraryData } from '../../../hooks/playlists/useSharedLibraryData';
import type { ServiceResponse } from '@aiponge/shared-contracts';
import { apiRequest } from '../../../lib/axiosApiClient';
import { queryKeys } from '../../../lib/queryKeys';
import type { SharedTrack } from '../../../types';

type PlaylistTracksResponse = ServiceResponse<{
  tracks: SharedTrack[];
  total: number;
}>;

export function LibrarianPlaylistsSection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  const {
    createPlaylist,
    deletePlaylist,
    addTrackToPlaylist,
    removeTrackFromPlaylist,
    isCreatingPlaylist,
    isAddingTrack,
  } = usePlaylistMutations();
  const { playlists, isLoadingPlaylists } = useMyMusicPlaylists();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<MyPlaylist | null>(null);
  const [showAddTracksModal, setShowAddTracksModal] = useState(false);
  const [addTracksSearch, setAddTracksSearch] = useState('');

  const { data: playlistTracksResponse, isLoading: isLoadingTracks } = useQuery<PlaylistTracksResponse>({
    queryKey: queryKeys.playlists.tracks(selectedPlaylist?.id ?? ''),
    queryFn: async () => {
      const result = await apiRequest(`/api/v1/app/playlists/${selectedPlaylist!.id}/tracks`);
      return result as PlaylistTracksResponse;
    },
    enabled: !!selectedPlaylist,
  });

  const playlistTracks = useMemo(() => {
    if (!playlistTracksResponse) return [];
    return (
      playlistTracksResponse?.data?.tracks ??
      (playlistTracksResponse as unknown as { tracks: SharedTrack[] })?.tracks ??
      []
    );
  }, [playlistTracksResponse]);

  const addTracksQueryKey = useMemo(
    () => ['/api/v1/app/library/shared', { search: addTracksSearch, genreFilter: '', languageFilter: '' }],
    [addTracksSearch]
  );

  const addTracksEndpoint = useMemo(() => {
    const params = new URLSearchParams();
    if (addTracksSearch) params.append('search', addTracksSearch);
    const qs = params.toString();
    return `/api/v1/app/library/shared${qs ? `?${qs}` : ''}`;
  }, [addTracksSearch]);

  const { tracks: availableTracks, isLoading: isLoadingAvailable } = useSharedLibraryData({
    tracksQueryKey: addTracksQueryKey,
    tracksEndpoint: addTracksEndpoint,
    selectedPlaylistId: null,
    smartKey: null,
  });

  const playlistTrackIds = useMemo(() => new Set(playlistTracks.map((t: SharedTrack) => t.id)), [playlistTracks]);

  const handleCreatePlaylist = async () => {
    const trimmedName = playlistName.trim();
    if (!trimmedName) return;
    try {
      await createPlaylist({ name: trimmedName, description: playlistDescription.trim() || undefined });
      setShowCreateModal(false);
      setPlaylistName('');
      setPlaylistDescription('');
    } catch {
      // error surfaced via mutation state
    }
  };

  const handleDeletePlaylist = useCallback(
    (playlist: MyPlaylist) => {
      Alert.alert(
        t('common.confirmDelete') || 'Delete',
        t('librarian.playlists.deleteConfirm', { title: playlist.name }) || `Delete "${playlist.name}"?`,
        [
          { text: t('common.cancel') || 'Cancel', style: 'cancel' },
          {
            text: t('common.delete') || 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deletePlaylist({ playlistId: playlist.id });
                if (selectedPlaylist?.id === playlist.id) {
                  setSelectedPlaylist(null);
                }
              } catch {
                // error surfaced via mutation state
              }
            },
          },
        ]
      );
    },
    [deletePlaylist, selectedPlaylist, t]
  );

  const handleAddTrack = useCallback(
    async (trackId: string) => {
      if (!selectedPlaylist) return;
      try {
        await addTrackToPlaylist({ playlistId: selectedPlaylist.id, trackId });
      } catch {
        // error surfaced via mutation state
      }
    },
    [addTrackToPlaylist, selectedPlaylist]
  );

  const handleRemoveTrack = useCallback(
    async (trackId: string) => {
      if (!selectedPlaylist) return;
      try {
        await removeTrackFromPlaylist({ playlistId: selectedPlaylist.id, trackId });
      } catch {
        // error surfaced via mutation state
      }
    },
    [removeTrackFromPlaylist, selectedPlaylist]
  );

  const getArtworkUrl = (url?: string) => {
    if (!url) return undefined;
    if (url.startsWith('http')) return url;
    return url;
  };

  if (selectedPlaylist) {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSelectedPlaylist(null)}>
          <Ionicons name="arrow-back" size={20} color={colors.brand.primary} />
          <Text style={styles.backText}>{t('librarian.studio.subtabs.playlists') || 'Playlists'}</Text>
        </TouchableOpacity>

        <View style={styles.playlistDetailHeader}>
          <View style={styles.playlistArtworkSmall}>
            {selectedPlaylist.artworkUrl ? (
              <Image
                source={{ uri: getArtworkUrl(selectedPlaylist.artworkUrl) }}
                style={styles.artworkImage}
                contentFit="cover"
              />
            ) : (
              <PlaylistArtwork playlistName={selectedPlaylist.name} size={64} />
            )}
          </View>
          <View style={styles.playlistDetailInfo}>
            <Text style={styles.playlistDetailTitle} numberOfLines={2}>
              {selectedPlaylist.name}
            </Text>
            {selectedPlaylist.description && (
              <Text style={styles.playlistDetailDesc} numberOfLines={1}>
                {selectedPlaylist.description}
              </Text>
            )}
            <Text style={styles.playlistDetailCount}>
              {t('components.playlistCard.trackCount', { count: playlistTracks.length })}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.addTracksButton}
          onPress={() => {
            setAddTracksSearch('');
            setShowAddTracksModal(true);
          }}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.absolute.white} />
          <Text style={styles.addTracksButtonText}>{t('librarian.playlists.addTracks') || 'Add Tracks'}</Text>
        </TouchableOpacity>

        {isLoadingTracks ? (
          <LoadingState fullScreen={false} />
        ) : playlistTracks.length === 0 ? (
          <EmptyState
            icon="musical-notes-outline"
            title={t('librarian.playlists.noTracksInPlaylist') || 'No tracks in this playlist'}
            description={t('librarian.playlists.addTracksHint') || 'Tap "Add Tracks" to add songs'}
          />
        ) : (
          <LiquidGlassCard intensity="medium" padding={0}>
            {playlistTracks.map((track: SharedTrack, index: number) => (
              <View key={track.id} style={[styles.trackRow, index > 0 && styles.trackRowBorder]}>
                <View style={styles.trackArtworkSmall}>
                  {track.artworkUrl ? (
                    <Image
                      source={{ uri: getArtworkUrl(track.artworkUrl) }}
                      style={styles.trackArtworkImage}
                      contentFit="cover"
                    />
                  ) : (
                    <Ionicons name="musical-note" size={20} color={colors.text.tertiary} />
                  )}
                </View>
                <View style={styles.trackInfo}>
                  <Text style={styles.trackTitle} numberOfLines={1}>
                    {track.title}
                  </Text>
                  {track.displayName && (
                    <Text style={styles.trackArtist} numberOfLines={1}>
                      {track.displayName}
                    </Text>
                  )}
                </View>
                <TouchableOpacity style={styles.removeTrackButton} onPress={() => handleRemoveTrack(track.id)}>
                  <Ionicons name="close-circle-outline" size={22} color={colors.semantic.error} />
                </TouchableOpacity>
              </View>
            ))}
          </LiquidGlassCard>
        )}

        <Modal
          visible={showAddTracksModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAddTracksModal(false)}
        >
          <View style={styles.addTracksModalContainer}>
            <View style={styles.addTracksModalContent}>
              <View style={styles.addTracksModalHeader}>
                <Text style={styles.addTracksModalTitle}>{t('librarian.playlists.addTracks') || 'Add Tracks'}</Text>
                <TouchableOpacity onPress={() => setShowAddTracksModal(false)}>
                  <Ionicons name="close" size={24} color={colors.text.secondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.addTracksSearchContainer}>
                <Ionicons name="search-outline" size={18} color={colors.text.tertiary} />
                <TextInput
                  style={styles.addTracksSearchInput}
                  value={addTracksSearch}
                  onChangeText={setAddTracksSearch}
                  placeholder={t('librarian.tracks.searchPlaceholder') || 'Search tracks...'}
                  placeholderTextColor={colors.text.tertiary}
                />
                {addTracksSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setAddTracksSearch('')}>
                    <Ionicons name="close-circle" size={18} color={colors.text.tertiary} />
                  </TouchableOpacity>
                )}
              </View>

              {isLoadingAvailable ? (
                <LoadingState fullScreen={false} />
              ) : (
                <FlatList
                  data={availableTracks}
                  keyExtractor={item => item.id}
                  contentContainerStyle={styles.addTracksList}
                  renderItem={({ item }) => {
                    const alreadyAdded = playlistTrackIds.has(item.id);
                    return (
                      <View style={styles.addTrackRow}>
                        <View style={styles.trackArtworkSmall}>
                          {item.artworkUrl ? (
                            <Image
                              source={{ uri: getArtworkUrl(item.artworkUrl) }}
                              style={styles.trackArtworkImage}
                              contentFit="cover"
                            />
                          ) : (
                            <Ionicons name="musical-note" size={20} color={colors.text.tertiary} />
                          )}
                        </View>
                        <View style={styles.trackInfo}>
                          <Text style={styles.trackTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          {item.displayName && (
                            <Text style={styles.trackArtist} numberOfLines={1}>
                              {item.displayName}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={[styles.addTrackAction, alreadyAdded && styles.addTrackActionDone]}
                          onPress={() => !alreadyAdded && handleAddTrack(item.id)}
                          disabled={alreadyAdded || isAddingTrack}
                        >
                          <Ionicons
                            name={alreadyAdded ? 'checkmark-circle' : 'add-circle-outline'}
                            size={26}
                            color={alreadyAdded ? colors.semantic.success : colors.brand.primary}
                          />
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={styles.centered}>
                      <Text style={styles.emptyText}>{t('librarian.tracks.noTracks') || 'No tracks found'}</Text>
                    </View>
                  }
                />
              )}
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {isLoadingPlaylists ? (
        <LoadingState fullScreen={false} />
      ) : playlists.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title={t('librarian.playlists.noPlaylists') || 'No playlists yet'}
          description={t('librarian.library.createPlaylistHint') || 'Create your first playlist to organize tracks'}
          action={{
            label: t('librarian.library.createPlaylist') || 'Create Playlist',
            onPress: () => {
              setPlaylistName('');
              setPlaylistDescription('');
              setShowCreateModal(true);
            },
            testID: 'button-create-first-playlist',
          }}
        />
      ) : (
        <>
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>
              {t('librarian.playlists.count', { count: playlists.length }) || `${playlists.length} playlists`}
            </Text>
            <TouchableOpacity
              style={styles.createButton}
              onPress={() => {
                setPlaylistName('');
                setPlaylistDescription('');
                setShowCreateModal(true);
              }}
            >
              <Ionicons name="add" size={20} color={colors.absolute.white} />
              <Text style={styles.createButtonText}>{t('common.create') || 'Create'}</Text>
            </TouchableOpacity>
          </View>

          {playlists.map(playlist => (
            <TouchableOpacity
              key={playlist.id}
              style={styles.playlistItem}
              onPress={() => setSelectedPlaylist(playlist)}
              activeOpacity={0.7}
            >
              <View style={styles.playlistArtworkSmall}>
                {playlist.artworkUrl ? (
                  <Image
                    source={{ uri: getArtworkUrl(playlist.artworkUrl) }}
                    style={styles.artworkImage}
                    contentFit="cover"
                  />
                ) : (
                  <PlaylistArtwork playlistName={playlist.name} size={48} />
                )}
              </View>
              <View style={styles.playlistItemInfo}>
                <Text style={styles.playlistItemTitle} numberOfLines={1}>
                  {playlist.name}
                </Text>
                <Text style={styles.playlistItemCount}>
                  {t('components.playlistCard.trackCount', { count: playlist.totalTracks })}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={e => {
                  e.stopPropagation?.();
                  handleDeletePlaylist(playlist);
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="trash-outline" size={18} color={colors.semantic.error} />
              </TouchableOpacity>
              <Ionicons name="chevron-forward" size={18} color={colors.text.tertiary} />
            </TouchableOpacity>
          ))}
        </>
      )}

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCreateModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('librarian.library.createPlaylist')}</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color={colors.text.secondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('common.playlistName', { defaultValue: 'Playlist Name' })}</Text>
              <TextInput
                style={styles.formInput}
                value={playlistName}
                onChangeText={setPlaylistName}
                placeholder={t('common.playlistName', { defaultValue: 'Playlist Name' })}
                placeholderTextColor={colors.text.tertiary}
                autoFocus
                maxLength={100}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>{t('common.description', { defaultValue: 'Description' })}</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={playlistDescription}
                onChangeText={setPlaylistDescription}
                placeholder={t('common.optional', { defaultValue: 'Optional' })}
                placeholderTextColor={colors.text.tertiary}
                multiline
                numberOfLines={3}
                maxLength={500}
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateModal(false)}
                disabled={isCreatingPlaylist}
              >
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmButton, !playlistName.trim() && styles.confirmButtonDisabled]}
                onPress={handleCreatePlaylist}
                disabled={!playlistName.trim() || isCreatingPlaylist}
              >
                {isCreatingPlaylist ? (
                  <ActivityIndicator size="small" color={colors.absolute.white} />
                ) : (
                  <Text style={styles.confirmButtonText}>{t('common.create')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      gap: 12,
    },
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 12,
    },
    emptyText: {
      fontSize: 15,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
      textAlign: 'center',
    },
    listHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    listHeaderTitle: {
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.tertiary,
    },
    createButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 8,
      paddingHorizontal: 14,
    },
    createButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    playlistItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      padding: 12,
      gap: 12,
    },
    playlistArtworkSmall: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.sm,
      overflow: 'hidden',
      backgroundColor: colors.background.tertiary,
    },
    artworkImage: {
      width: '100%',
      height: '100%',
    },
    playlistItemInfo: {
      flex: 1,
    },
    playlistItemTitle: {
      fontSize: 15,
      fontWeight: '600',
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.primary,
    },
    playlistItemCount: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 2,
    },
    deleteButton: {
      padding: 6,
    },
    backButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 4,
    },
    backText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.brand.primary,
    },
    playlistDetailHeader: {
      flexDirection: 'row',
      gap: 16,
      alignItems: 'center',
    },
    playlistDetailInfo: {
      flex: 1,
    },
    playlistDetailTitle: {
      fontSize: 18,
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    playlistDetailDesc: {
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 2,
    },
    playlistDetailCount: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 4,
    },
    addTracksButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.brand.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 12,
    },
    addTracksButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.absolute.white,
    },
    trackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      gap: 12,
    },
    trackRowBorder: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border.primary,
    },
    trackArtworkSmall: {
      width: 40,
      height: 40,
      borderRadius: BORDER_RADIUS.xs,
      overflow: 'hidden',
      backgroundColor: colors.background.tertiary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    trackArtworkImage: {
      width: '100%',
      height: '100%',
    },
    trackInfo: {
      flex: 1,
    },
    trackTitle: {
      fontSize: 14,
      fontWeight: '600',
      fontFamily: fontFamilies.body.semibold,
      color: colors.text.primary,
    },
    trackArtist: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 1,
    },
    removeTrackButton: {
      padding: 4,
    },
    addTracksModalContainer: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    addTracksModalContent: {
      height: '80%',
      backgroundColor: colors.background.primary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 16,
    },
    addTracksModalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      marginBottom: 12,
    },
    addTracksModalTitle: {
      fontSize: 18,
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    addTracksSearchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.xl,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginHorizontal: 20,
      marginBottom: 12,
      gap: 8,
    },
    addTracksSearchInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: fontFamilies.body.regular,
      color: colors.text.primary,
      padding: 0,
    },
    addTracksList: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    addTrackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border.primary,
    },
    addTrackAction: {
      padding: 4,
    },
    addTrackActionDone: {
      opacity: 0.7,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    modalContent: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.background.secondary,
      borderRadius: 20,
      padding: 24,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '700',
      fontFamily: fontFamilies.body.bold,
      color: colors.text.primary,
    },
    formGroup: {
      marginBottom: 16,
    },
    formLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
      marginBottom: 8,
    },
    formInput: {
      backgroundColor: colors.background.primary,
      borderRadius: BORDER_RADIUS.md,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text.primary,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    formTextArea: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    modalActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      backgroundColor: colors.background.primary,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    cancelButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.secondary,
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
      alignItems: 'center',
      backgroundColor: colors.brand.primary,
    },
    confirmButtonDisabled: {
      opacity: 0.5,
    },
    confirmButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.absolute.white,
    },
  });
