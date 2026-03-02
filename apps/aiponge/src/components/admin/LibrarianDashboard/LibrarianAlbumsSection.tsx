import { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter, type Href } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { useThemeColors, type ColorScheme } from '@/theme';
import { BORDER_RADIUS } from '@/theme/constants';
import { fontFamilies } from '@/theme/typography';
import { useTranslation } from '@/i18n';
import { useSharedAlbums, SharedAlbum } from '@/hooks/playlists/useSharedAlbums';
import { queryKeys } from '@/lib/queryKeys';
import { apiRequest } from '@/lib/axiosApiClient';
import { invalidateOnEvent } from '@/lib/cacheManager';
import { logError, getTranslatedFriendlyMessage } from '@/utils/errorSerialization';
import { useToast } from '@/hooks/ui/use-toast';
import { LiquidGlassCard } from '../../ui';
import { LoadingState } from '../../shared';

export function LibrarianAlbumsSection() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { albums, isLoading, isError, isLibrarian } = useSharedAlbums();

  const deleteAlbumMutation = useMutation({
    mutationFn: async (albumId: string) => {
      await apiRequest(`/api/v1/app/library/albums/${albumId}`, {
        method: 'DELETE',
      });
    },
    onMutate: async deletedAlbumId => {
      // Cancel ALL album queries to prevent any in-flight refetch from overwriting
      await queryClient.cancelQueries({ queryKey: queryKeys.albums.all });
      const previousData = queryClient.getQueryData(queryKeys.albums.public());

      // Optimistic: remove from all album list caches (public, shared, list)
      const filterAlbumOut = (old: unknown): unknown => {
        if (!old || typeof old !== 'object') return old;
        const d = old as Record<string, unknown>;
        if (d.data && typeof d.data === 'object') {
          const data = d.data as Record<string, unknown>;
          if (Array.isArray(data.albums)) {
            return {
              ...d,
              data: {
                ...data,
                albums: data.albums.filter((a: { id: string }) => a.id !== deletedAlbumId),
                total: Math.max(0, ((data.total as number) || 0) - 1),
              },
            };
          }
        }
        return old;
      };
      queryClient.setQueriesData({ queryKey: queryKeys.albums.all }, filterAlbumOut);

      return { previousData };
    },
    onSuccess: (_data, deletedAlbumId) => {
      // Remove detail caches immediately
      queryClient.removeQueries({ queryKey: queryKeys.albums.detail(deletedAlbumId) });
      queryClient.removeQueries({ queryKey: queryKeys.albums.publicDetail(deletedAlbumId) });

      // Delayed invalidation for broader cleanup (tracks, shared library).
      // Follows the applyTrackDeletionToCache pattern: avoid immediate refetch that
      // could return stale gateway-cached data and overwrite our optimistic removal.
      setTimeout(() => {
        invalidateOnEvent(queryClient, { type: 'ALBUM_DELETED', albumId: deletedAlbumId });
      }, 1500);
    },
    onError: (err, _deletedAlbumId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.albums.public(), context.previousData);
      }
      const serialized = logError(err, 'Delete Album', 'librarian-albums');
      toast({
        title: t('common.error', 'Error'),
        description: getTranslatedFriendlyMessage(serialized, t),
        variant: 'destructive',
      });
    },
  });

  const handleDeleteAlbum = useCallback(
    (albumId: string) => {
      Alert.alert(
        t('albums.deleteAlbum'),
        t('albums.deleteAlbumConfirm'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('common.delete'),
            style: 'destructive',
            onPress: () => deleteAlbumMutation.mutate(albumId),
          },
        ],
        { cancelable: true }
      );
    },
    [deleteAlbumMutation, t]
  );

  const renderRightActions = useCallback(
    (album: SharedAlbum) =>
      (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
        const trans = dragX.interpolate({
          inputRange: [-80, 0],
          outputRange: [0, 80],
          extrapolate: 'clamp',
        });
        return (
          <Animated.View style={[styles.deleteAction, { transform: [{ translateX: trans }] }]}>
            <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteAlbum(album.id)}>
              <Ionicons name="trash-outline" size={22} color={colors.absolute.white} />
              <Text style={styles.deleteText}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </Animated.View>
        );
      },
    [handleDeleteAlbum, styles, t]
  );

  const handleAlbumPress = (albumId: string) => {
    router.push({
      pathname: '/album-detail',
      params: { albumId, visibility: CONTENT_VISIBILITY.SHARED },
    } as Href);
  };

  if (isLoading) {
    return <LoadingState message={t('common.loading')} />;
  }

  if (isError) {
    return (
      <LiquidGlassCard intensity="light" padding={20}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={32} color={colors.semantic.error} />
          <Text style={styles.errorText}>{t('errors.loadingFailed')}</Text>
        </View>
      </LiquidGlassCard>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('librarian.library.albumsTitle')}</Text>
        <Text style={styles.count}>
          {albums?.length || 0} {t('librarian.library.albums')}
        </Text>
      </View>

      {!albums || albums.length === 0 ? (
        <LiquidGlassCard intensity="light" padding={24}>
          <View style={styles.emptyContainer}>
            <Ionicons name="albums-outline" size={48} color={colors.text.tertiary} />
            <Text style={styles.emptyTitle}>{t('librarian.library.noAlbums')}</Text>
            <Text style={styles.emptyText}>{t('librarian.library.noAlbumsDescription')}</Text>
          </View>
        </LiquidGlassCard>
      ) : (
        <View style={styles.albumsGrid}>
          {albums.map((album: SharedAlbum) => {
            const card = (
              <TouchableOpacity style={styles.albumCard} onPress={() => handleAlbumPress(album.id)}>
                {album.coverArtworkUrl ? (
                  <Image source={{ uri: album.coverArtworkUrl }} style={styles.albumArtwork} />
                ) : (
                  <View style={[styles.albumArtwork, styles.placeholderArtwork]}>
                    <Ionicons name="albums" size={32} color={colors.text.tertiary} />
                  </View>
                )}
                <View style={styles.albumInfo}>
                  <Text style={styles.albumTitle} numberOfLines={1}>
                    {album.title}
                  </Text>
                  <Text style={styles.albumArtist} numberOfLines={1}>
                    {album.displayName}
                  </Text>
                  <Text style={styles.albumTracks}>
                    {album.totalTracks} {t('common.tracks')}
                  </Text>
                </View>
              </TouchableOpacity>
            );

            if (!isLibrarian) return <View key={album.id}>{card}</View>;

            return (
              <Swipeable key={album.id} renderRightActions={renderRightActions(album)} overshootRight={false}>
                {card}
              </Swipeable>
            );
          })}
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
    errorContainer: {
      alignItems: 'center',
      gap: 12,
    },
    errorText: {
      fontSize: 14,
      color: colors.semantic.error,
      textAlign: 'center',
    },
    emptyContainer: {
      alignItems: 'center',
      gap: 12,
    },
    emptyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    emptyText: {
      fontSize: 14,
      color: colors.text.secondary,
      textAlign: 'center',
    },
    albumsGrid: {
      gap: 12,
    },
    albumCard: {
      flexDirection: 'row',
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    albumArtwork: {
      width: 80,
      height: 80,
      backgroundColor: colors.background.tertiary,
    },
    placeholderArtwork: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    albumInfo: {
      flex: 1,
      padding: 12,
      justifyContent: 'center',
      gap: 4,
    },
    albumTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text.primary,
    },
    albumArtist: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    albumTracks: {
      fontSize: 12,
      color: colors.text.tertiary,
    },
    deleteAction: {
      width: 80,
      justifyContent: 'center',
      alignItems: 'center',
    },
    deleteButton: {
      flex: 1,
      width: '100%',
      backgroundColor: colors.semantic.error,
      justifyContent: 'center',
      alignItems: 'center',
      borderTopRightRadius: BORDER_RADIUS.md,
      borderBottomRightRadius: BORDER_RADIUS.md,
      gap: 4,
    },
    deleteText: {
      color: colors.absolute.white,
      fontSize: 11,
      fontWeight: '600',
    },
  });
