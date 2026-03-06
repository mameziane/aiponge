import { memo, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { spacing } from '../../theme/spacing';
import { LiquidGlassCard } from '../ui';

interface BrowseLibraryCTAProps {
  visible: boolean;
}

export const BrowseLibraryCTA = memo(function BrowseLibraryCTA({ visible }: BrowseLibraryCTAProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const router = useRouter();

  const handlePress = useCallback(() => router.push('/music-library'), [router]);

  if (!visible) return null;

  return (
    <View style={styles.section}>
      <TouchableOpacity
        onPress={handlePress}
        testID="browse-full-library-button"
        activeOpacity={0.8}
        style={styles.browseLibraryWrapper}
      >
        <LiquidGlassCard intensity="medium" padding={16}>
          <View style={styles.browseLibraryInner}>
            <View style={styles.browseLibraryContent}>
              <Ionicons name="library" size={24} color={colors.brand.primary} />
              <View style={styles.browseLibraryText}>
                <Text style={styles.browseLibraryTitle}>{t('explore.browseFullLibrary')}</Text>
                <Text style={styles.browseLibrarySubtitle}>{t('explore.discoverAllTracks')}</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.text.tertiary} />
          </View>
        </LiquidGlassCard>
      </TouchableOpacity>
    </View>
  );
});

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    section: {
      marginTop: 24,
    },
    browseLibraryWrapper: {
      marginHorizontal: spacing.screenHorizontal,
    },
    browseLibraryInner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    browseLibraryContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    browseLibraryText: {
      marginLeft: 12,
    },
    browseLibraryTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    browseLibrarySubtitle: {
      fontSize: 13,
      color: colors.text.secondary,
      marginTop: 2,
    },
  });
