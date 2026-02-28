import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { normalizeMediaUrl } from '../../lib/apiConfig';

const BLURHASH = 'L5H2EC=PM+yV0g-mq.wG9c010J}I';

interface TitlePageProps {
  title: string;
  subtitle?: string;
  author?: string;
  coverIllustrationUrl?: string;
  category: string;
}

export function TitlePage({ title, subtitle, author, coverIllustrationUrl, category }: TitlePageProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const categoryColor = colors.category[category] || colors.brand.primary;

  return (
    <View style={styles.container}>
      {coverIllustrationUrl ? (
        <Image
          source={{ uri: normalizeMediaUrl(coverIllustrationUrl) }}
          style={styles.coverArtworkUrl}
          contentFit="contain"
          placeholder={BLURHASH}
          transition={200}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.coverPlaceholder, { backgroundColor: categoryColor }]} />
      )}

      <Text style={styles.title}>{title}</Text>

      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      {author && (
        <Text style={styles.author}>
          {t('common.by')} {author}
        </Text>
      )}

      <View style={styles.metaContainer} />
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingTop: 110,
      paddingBottom: 48,
    },
    coverArtworkUrl: {
      width: 200,
      height: 280,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 32,
    },
    coverPlaceholder: {
      width: 200,
      height: 280,
      borderRadius: BORDER_RADIUS.sm,
      marginBottom: 32,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: colors.text.primary,
      textAlign: 'center',
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 18,
      color: colors.text.secondary,
      textAlign: 'center',
      marginBottom: 16,
    },
    author: {
      fontSize: 16,
      color: colors.brand.primary,
      textAlign: 'center',
      marginBottom: 24,
    },
    metaContainer: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
    },
    badge: {
      paddingHorizontal: 16,
      paddingVertical: 6,
      borderRadius: BORDER_RADIUS.lg,
      backgroundColor: colors.background.darkCard,
    },
    badgeText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text.dark,
    },
  });
