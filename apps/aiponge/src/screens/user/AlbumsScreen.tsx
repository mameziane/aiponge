import { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAlbums, UserAlbum } from '../../hooks/music/useAlbums';
import { useSearch } from '../../stores';
import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../theme';
import { useTranslation } from '../../i18n';
import { LiquidGlassCard } from '../../components/ui';
import { DraftAlbumCard, useDraftAlbum } from '../../components/playlists/DraftAlbumCard';
import { LoadingState } from '../../components/shared/LoadingState';
import { ErrorState } from '../../components/shared/ErrorState';
import { EmptyState } from '../../components/shared/EmptyState';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  if (mins < 60) {
    return `${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours}h ${remainingMins}m`;
}

export function AlbumsScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const router = useRouter();
  const { albums, total, isLoading, isError } = useAlbums();
  const { draftAlbums, hasDraftAlbum } = useDraftAlbum();
  const { isSearchActive, registerSearch, unregisterSearch } = useSearch();
  const [localSearchQuery, setLocalSearchQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      registerSearch({
        placeholder: t('search.albumsPlaceholder'),
        enabled: true,
        onSearch: query => setLocalSearchQuery(query),
        onClear: () => setLocalSearchQuery(''),
      });

      return () => {
        unregisterSearch();
      };
    }, [registerSearch, unregisterSearch, t])
  );

  const filteredAlbums = useMemo(() => {
    if (!localSearchQuery.trim()) return albums;
    const query = localSearchQuery.toLowerCase().trim();
    return albums.filter(
      album => album.title.toLowerCase().includes(query) || (album.mood && album.mood.toLowerCase().includes(query))
    );
  }, [albums, localSearchQuery]);

  const handleAlbumPress = useCallback(
    (album: UserAlbum) => {
      router.push({
        pathname: '/album-detail',
        params: { albumId: album.id },
      });
    },
    [router]
  );

  const keyExtractor = useCallback((item: UserAlbum) => item.id, []);

  const renderAlbumItem = useCallback(
    ({ item: album }: { item: UserAlbum }) => (
      <TouchableOpacity
        style={styles.albumCard}
        onPress={() => handleAlbumPress(album)}
        activeOpacity={0.7}
        testID={`album-card-${album.id}`}
      >
        <LiquidGlassCard intensity="medium" padding={0}>
          <View style={styles.albumContent}>
            {album.coverArtworkUrl ? (
              <Image
                source={{ uri: album.coverArtworkUrl }}
                style={styles.albumArtwork}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
              />
            ) : (
              <View style={styles.albumArtworkPlaceholder}>
                <Ionicons name="musical-notes" size={40} color={colors.brand.primary} />
              </View>
            )}
            <View style={styles.albumInfo}>
              <Text style={styles.albumTitle} numberOfLines={2}>
                {album.title}
              </Text>
              {album.mood && (
                <View style={styles.moodBadge}>
                  <Text style={styles.moodText}>{album.mood}</Text>
                </View>
              )}
              <Text style={styles.albumMeta}>
                {t('albums.trackCount', { count: album.totalTracks })}
                {album.totalDurationSeconds > 0 && ` · ${formatDuration(album.totalDurationSeconds)}`}
              </Text>
            </View>
          </View>
        </LiquidGlassCard>
      </TouchableOpacity>
    ),
    [styles, handleAlbumPress, colors.brand.primary, t]
  );

  const ListHeaderComponent = useMemo(
    () => (
      <>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('albums.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('albums.albumCount', { count: total })}</Text>
        </View>

        {hasDraftAlbum && (
          <View style={styles.draftSection}>
            <Text style={styles.sectionTitle}>{t('albums.creatingAlbum')}</Text>
            <View style={styles.draftGrid}>
              {draftAlbums.map(draft => (
                <DraftAlbumCard key={draft.id} generation={draft} flexible />
              ))}
            </View>
          </View>
        )}
      </>
    ),
    [styles, t, total, hasDraftAlbum, draftAlbums]
  );

  const ListEmptyComponent = useMemo(() => {
    if (isSearchActive && localSearchQuery.trim()) {
      return (
        <View style={styles.noResultsContainer}>
          <Ionicons name="search" size={48} color={colors.text.secondary} />
          <Text style={styles.noResultsText}>{t('search.noResults')}</Text>
          <Text style={styles.noResultsHint}>{t('search.tryDifferentTerms')}</Text>
        </View>
      );
    }
    return null;
  }, [isSearchActive, localSearchQuery, styles, colors.text.secondary, t]);

  if (isLoading) {
    return <LoadingState message={t('albums.loading')} />;
  }

  if (isError) {
    return <ErrorState message={t('albums.failedToLoad')} />;
  }

  if (albums.length === 0 && !hasDraftAlbum) {
    return (
      <EmptyState
        icon="library-outline"
        title={t('albums.noAlbumsYet')}
        description={t('albums.createAlbumHint')}
        action={{ label: t('albums.goToJournal'), onPress: () => router.push('/books'), testID: 'button-go-to-books' }}
        testID="empty-albums"
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredAlbums}
        renderItem={renderAlbumItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={styles.listContent}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={true}
        showsVerticalScrollIndicator={false}
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
    listContent: {
      paddingBottom: 100,
      paddingHorizontal: 16,
    },
    header: {
      paddingTop: 16,
      paddingBottom: 8,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text.primary,
    },
    headerSubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 4,
    },
    albumCard: {
      marginBottom: 12,
    },
    albumContent: {
      flexDirection: 'row',
      overflow: 'hidden',
      borderRadius: BORDER_RADIUS.md,
    },
    albumArtwork: {
      width: 100,
      height: 100,
      borderRadius: BORDER_RADIUS.sm,
      margin: 8,
    },
    albumArtworkPlaceholder: {
      width: 100,
      height: 100,
      borderRadius: BORDER_RADIUS.sm,
      margin: 8,
      backgroundColor: colors.state.hover,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    albumInfo: {
      flex: 1,
      paddingVertical: 12,
      paddingRight: 12,
      justifyContent: 'center',
    },
    albumTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 2,
    },
    moodBadge: {
      alignSelf: 'flex-start',
      backgroundColor: `${colors.brand.primary}20`,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 2,
    },
    moodText: {
      fontSize: 11,
      color: colors.brand.primary,
      fontWeight: '500',
      textTransform: 'capitalize',
    },
    albumMeta: {
      fontSize: 13,
      color: colors.text.secondary,
    },
    noResultsContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 32,
    },
    noResultsText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginTop: 16,
    },
    noResultsHint: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 4,
    },
    draftSection: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 12,
    },
    draftGrid: {
      flexDirection: 'row' as const,
      flexWrap: 'wrap' as const,
      justifyContent: 'space-between' as const,
    },
  });
