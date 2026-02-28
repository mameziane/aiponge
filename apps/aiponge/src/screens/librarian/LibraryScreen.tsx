import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback, useMemo } from 'react';
import { useThemeColors, commonStyles, type ColorScheme } from '../../theme';
import { useTranslation } from '../../i18n';
import { LibrarianSubTabBar } from '../../components/admin/LibrarianDashboard/LibrarianSubTabBar';
import { LibrarianAlbumsSection } from '../../components/admin/LibrarianDashboard/LibrarianAlbumsSection';
import { LibrarianTracksSection } from '../../components/admin/LibrarianDashboard/LibrarianTracksSection';

type SubTab = 'albums' | 'tracks';

export default function LibrarianLibraryScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<SubTab>('albums');

  const subTabs = useMemo(
    () => [
      { id: 'albums', label: t('librarian.library.subtabs.albums') || 'Albums' },
      { id: 'tracks', label: t('librarian.library.subtabs.tracks') || 'Tracks' },
    ],
    [t]
  );
  const [refreshing, setRefreshing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId as SubTab);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey(prev => prev + 1);
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  return (
    <View style={styles.container}>
      <LibrarianSubTabBar tabs={subTabs} activeTab={activeTab} onTabChange={handleTabChange} />

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand.primary} />
        }
      >
        {activeTab === 'albums' && <LibrarianAlbumsSection key={`albums-${refreshKey}`} />}
        {activeTab === 'tracks' && <LibrarianTracksSection key={`tracks-${refreshKey}`} />}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    content: commonStyles.flexOne,
    contentContainer: {
      padding: 16,
      paddingBottom: 100,
      gap: 16,
    },
  });
