import { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { SectionHeader } from '../shared/SectionHeader';
import { ChartList } from '../playlists/ChartList';
import { spacing } from '../../theme/spacing';
import type { ChartTrack, ExploreTrack, UserCreation } from './types';

interface TopChartsSectionProps {
  topCharts: ChartTrack[];
  onTrackPress: (track: ExploreTrack | UserCreation) => void;
  onTrackLongPress: (track: ExploreTrack | UserCreation) => void;
  onToggleFavorite?: (trackId: string) => void;
  isLiked: (trackId: string) => boolean;
  canLike: boolean;
  currentTrackId?: string;
  isPlaying: boolean;
}

export const TopChartsSection = memo(function TopChartsSection({
  topCharts,
  onTrackPress,
  onTrackLongPress,
  onToggleFavorite,
  isLiked,
  canLike,
  currentTrackId,
  isPlaying,
}: TopChartsSectionProps) {
  const { t } = useTranslation();

  if (topCharts.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SectionHeader
          title={t('explore.topCharts')}
          subtitle={t('explore.hottestTracks')}
          testID="top-charts-header"
        />
      </View>
      <ChartList
        tracks={topCharts}
        onTrackPress={track => onTrackPress(track)}
        onTrackLongPress={track => onTrackLongPress(track)}
        onToggleFavorite={canLike ? onToggleFavorite : undefined}
        isFavorite={isLiked}
        currentTrackId={currentTrackId}
        isPlaying={isPlaying}
        testID="top-charts-list"
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
