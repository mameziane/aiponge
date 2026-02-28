import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from '../../i18n';
import { SectionHeader } from '../shared/SectionHeader';
import { HorizontalCarousel } from '../shared/HorizontalCarousel';
import { PlaylistCard } from '../playlists/PlaylistCard';
import { spacing } from '../../theme/spacing';
import type { ExplorePlaylist } from './types';

interface FeaturedPlaylistsSectionProps {
  featuredPlaylists: ExplorePlaylist[];
}

export const FeaturedPlaylistsSection = memo(function FeaturedPlaylistsSection({
  featuredPlaylists,
}: FeaturedPlaylistsSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();

  if (featuredPlaylists.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SectionHeader
          title={t('explore.featuredPlaylists')}
          subtitle={t('explore.curatedPlaylists')}
          testID="featured-playlists-header"
        />
      </View>
      <HorizontalCarousel
        data={featuredPlaylists}
        renderItem={playlist => {
          if (!playlist?.id) return <></>;
          return (
            <PlaylistCard
              key={playlist.id}
              id={playlist.id}
              title={playlist.title}
              description={playlist.description}
              artworkUrl={playlist.artworkUrl}
              totalTracks={playlist.totalTracks}
              onPress={() =>
                router.push({
                  pathname: '/music-library',
                  params: { selectPlaylist: playlist.id },
                })
              }
            />
          );
        }}
        keyExtractor={playlist => playlist?.id || ''}
        testID="featured-playlists-carousel"
      />
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  sectionHeader: {
    paddingHorizontal: spacing.screenHorizontal,
  },
});
