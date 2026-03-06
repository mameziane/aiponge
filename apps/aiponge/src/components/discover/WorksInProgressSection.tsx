import { memo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from '../../i18n';
import { SectionHeader } from '../shared/SectionHeader';
import { WorkInProgressTile } from '../shared/WorkInProgressTile';
import { spacing } from '../../theme/spacing';
import type { WorkInProgress } from './types';

interface WorksInProgressSectionProps {
  worksInProgress: WorkInProgress[];
}

export const WorksInProgressSection = memo(function WorksInProgressSection({
  worksInProgress,
}: WorksInProgressSectionProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const handlePress = useCallback(() => router.push('/(user)/create' as Href), [router]);

  if (worksInProgress.length === 0) return null;

  return (
    <View style={[styles.section, styles.lastSection]}>
      <View style={styles.sectionHeader}>
        <SectionHeader
          title={t('explore.worksInProgress')}
          subtitle={t('explore.draftsPending')}
          testID="works-in-progress-header"
        />
      </View>
      <View style={styles.wipContainer}>
        {worksInProgress.map(wip => (
          <WorkInProgressTile
            key={wip.id}
            id={wip.id}
            title={wip.title}
            status={wip.status}
            updatedAt={wip.updatedAt}
            onPress={handlePress}
          />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  section: {
    marginTop: 24,
  },
  lastSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    paddingHorizontal: spacing.screenHorizontal,
  },
  wipContainer: {
    paddingHorizontal: spacing.screenHorizontal,
  },
});
