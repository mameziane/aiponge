import { memo, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CONTENT_VISIBILITY } from '@aiponge/shared-contracts';
import { useTranslation } from '../../i18n';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { LiquidGlassCard } from '../ui';
import { DraftAlbumCard } from '../playlists/DraftAlbumCard';
import { useThemeColors, BORDER_RADIUS, type ColorScheme } from '../../theme';
import { spacing } from '../../theme/spacing';
import type { UserAlbum, SharedAlbum, AlbumGenerationProgress } from './types';

interface AlbumsSectionProps {
  albums: UserAlbum[];
  sharedAlbums: SharedAlbum[];
  draftAlbums: AlbumGenerationProgress[];
  draftSharedAlbums: AlbumGenerationProgress[];
  hasDraftAlbum: boolean;
  hasDraftSharedAlbum: boolean;
  isSectionExpanded: (key: string) => boolean;
  toggleSection: (key: string) => void;
}

export const AlbumsSection = memo(function AlbumsSection({
  albums,
  sharedAlbums,
  draftAlbums,
  draftSharedAlbums,
  hasDraftAlbum,
  hasDraftSharedAlbum,
  isSectionExpanded,
  toggleSection,
}: AlbumsSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const showPrivateAlbums = albums.length > 0 || hasDraftAlbum;
  const showSharedAlbums = sharedAlbums.length > 0 || hasDraftSharedAlbum;

  if (!showPrivateAlbums && !showSharedAlbums) return null;

  return (
    <>
      {showPrivateAlbums && (
        <CollapsibleSection
          title={t('albums.privateAlbums')}
          subtitle={hasDraftAlbum ? t('albums.generatingAlbum') : t('albums.albumCount', { count: albums.length })}
          icon="lock-closed"
          isExpanded={isSectionExpanded('private_albums')}
          onToggle={() => toggleSection('private_albums')}
          onSeeAllPress={albums.length > 0 ? () => router.push('/albums') : undefined}
          testID="private-albums-section"
        >
          {hasDraftAlbum && draftAlbums.length > 0 && (
            <View style={styles.draftGrid}>
              {draftAlbums.map(draft => (
                <DraftAlbumCard key={draft.id} generation={draft} testID={`draft-album-card-${draft.id}`} flexible />
              ))}
            </View>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.albumsScrollContent}
          >
            {albums.slice(0, 10).map((album: UserAlbum) => (
              <TouchableOpacity
                key={album.id}
                style={styles.albumCardSmall}
                onPress={() =>
                  router.push({
                    pathname: '/album-detail',
                    params: { albumId: album.id },
                  })
                }
                activeOpacity={0.7}
                testID={`album-card-${album.id}`}
              >
                <LiquidGlassCard intensity="medium" padding={0}>
                  <View style={styles.albumCardContent}>
                    {album.coverArtworkUrl ? (
                      <Image
                        source={{ uri: album.coverArtworkUrl }}
                        style={styles.albumArtworkImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={200}
                      />
                    ) : (
                      <View style={styles.albumArtworkPlaceholder}>
                        <Ionicons name="musical-notes" size={32} color={colors.brand.primary} />
                      </View>
                    )}
                    <View style={styles.albumCardInfo}>
                      <Text style={styles.albumCardTitle} numberOfLines={1}>
                        {album.title}
                      </Text>
                      <Text style={styles.albumCardArtist} numberOfLines={1}>
                        {t('explore.youCreator')}
                      </Text>
                      <Text style={styles.albumCardSubtitle}>
                        {t('albums.trackCount', { count: album.totalTracks })}
                      </Text>
                    </View>
                  </View>
                </LiquidGlassCard>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </CollapsibleSection>
      )}

      {showSharedAlbums && (
        <CollapsibleSection
          title={t('albums.publicAlbums')}
          subtitle={
            hasDraftSharedAlbum ? t('albums.generatingAlbum') : t('albums.albumCount', { count: sharedAlbums.length })
          }
          icon="globe"
          isExpanded={isSectionExpanded('public_albums')}
          onToggle={() => toggleSection('public_albums')}
          testID="public-albums-section"
        >
          {hasDraftSharedAlbum && draftSharedAlbums.length > 0 && (
            <View style={styles.draftGrid}>
              {draftSharedAlbums.map(draft => (
                <DraftAlbumCard
                  key={draft.id}
                  generation={draft}
                  testID={`draft-shared-album-card-${draft.id}`}
                  flexible
                />
              ))}
            </View>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.albumsScrollContent}
          >
            {sharedAlbums.slice(0, 10).map((album: SharedAlbum) => (
              <TouchableOpacity
                key={album.id}
                style={styles.albumCardSmall}
                onPress={() =>
                  router.push({
                    pathname: '/album-detail',
                    params: { albumId: album.id, visibility: CONTENT_VISIBILITY.SHARED },
                  })
                }
                activeOpacity={0.7}
                testID={`shared-album-card-${album.id}`}
              >
                <LiquidGlassCard intensity="medium" padding={0}>
                  <View style={styles.albumCardContent}>
                    {album.coverArtworkUrl ? (
                      <Image
                        source={{ uri: album.coverArtworkUrl }}
                        style={styles.albumArtworkImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={200}
                      />
                    ) : (
                      <View style={styles.albumArtworkPlaceholder}>
                        <Ionicons name="musical-notes" size={32} color={colors.brand.primary} />
                      </View>
                    )}
                    <View style={styles.albumCardInfo}>
                      <Text style={styles.albumCardTitle} numberOfLines={1}>
                        {album.title}
                      </Text>
                      <Text style={styles.albumCardArtist} numberOfLines={1}>
                        {album.displayName}
                      </Text>
                      <View style={styles.albumCardMeta}>
                        <View style={styles.libraryBadge}>
                          <Ionicons name="library-outline" size={10} color={colors.brand.primary} />
                        </View>
                        <Text style={styles.albumCardSubtitle}>
                          {t('albums.trackCount', { count: album.totalTracks })}
                        </Text>
                      </View>
                    </View>
                  </View>
                </LiquidGlassCard>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </CollapsibleSection>
      )}
    </>
  );
});

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    draftGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.screenHorizontal,
      marginBottom: 12,
    },
    albumCardSmall: {
      width: 160,
      marginRight: 12,
    },
    albumsScrollContent: {
      paddingHorizontal: spacing.screenHorizontal,
    },
    albumCardContent: {
      width: 160,
    },
    albumArtworkImage: {
      width: 160,
      height: 120,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
    },
    albumArtworkPlaceholder: {
      width: 160,
      height: 120,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      backgroundColor: colors.background.secondary,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    albumCardInfo: {
      padding: 12,
    },
    albumCardTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.primary,
      marginBottom: 2,
    },
    albumCardArtist: {
      fontSize: 12,
      color: colors.text.secondary,
      marginBottom: 4,
    },
    albumCardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    libraryBadge: {
      width: 16,
      height: 16,
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: colors.background.subtle,
      justifyContent: 'center',
      alignItems: 'center',
    },
    albumCardSubtitle: {
      fontSize: 12,
      color: colors.text.secondary,
    },
  });
