import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { useTranslation } from '../../i18n';
import { LiquidGlassCard } from '../../components/ui';

interface ManifestoSection {
  titleKey: string;
  contentKey: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const sections: ManifestoSection[] = [
  {
    titleKey: 'manifesto.section1.title',
    contentKey: 'manifesto.section1.content',
    icon: 'navigate',
  },
  {
    titleKey: 'manifesto.section2.title',
    contentKey: 'manifesto.section2.content',
    icon: 'musical-notes',
  },
  {
    titleKey: 'manifesto.section3.title',
    contentKey: 'manifesto.section3.content',
    icon: 'heart',
  },
  {
    titleKey: 'manifesto.section4.title',
    contentKey: 'manifesto.section4.content',
    icon: 'flask',
  },
];

export function ManifestoScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="manifesto-page"
      >
        <View style={styles.sectionsContainer}>
          {sections.map((section, index) => (
            <LiquidGlassCard
              key={index}
              intensity="medium"
              padding={20}
              borderRadius={16}
              style={styles.section}
              testID={`manifesto-section-${index}`}
            >
              <View style={styles.sectionHeader}>
                <View style={styles.iconCircle}>
                  <Ionicons name={section.icon} size={24} color={colors.brand.primary} />
                </View>
                <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text>
              </View>

              <Text style={styles.sectionContent}>{t(section.contentKey)}</Text>
            </LiquidGlassCard>
          ))}
        </View>

        <LinearGradient
          colors={colors.gradients.premiumDark}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.footer}
        >
          <Text style={styles.footerQuote}>
            {t('manifesto.footer.quote1')}
            {'\n'}
            {t('manifesto.footer.quote2')}
          </Text>
          <View style={styles.divider} />
          <Text style={styles.footerSource}>{t('manifesto.footer.source')}</Text>
        </LinearGradient>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      ...commonStyles.screenContainer,
      backgroundColor: colors.background.primary,
    },
    scrollView: commonStyles.flexOne,
    scrollContent: {
      paddingBottom: 40,
    },
    sectionsContainer: {
      paddingHorizontal: 20,
    },
    section: {
      marginBottom: 16,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    iconCircle: {
      width: 48,
      height: 48,
      borderRadius: BORDER_RADIUS.xl,
      backgroundColor: colors.background.subtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: '600',
      color: colors.text.primary,
      marginLeft: 12,
      flex: 1,
    },
    sectionContent: {
      fontSize: 16,
      lineHeight: 26,
      color: colors.text.secondary,
    },
    footer: {
      marginHorizontal: 20,
      marginTop: 16,
      padding: 24,
      borderRadius: BORDER_RADIUS.lg,
      alignItems: 'center',
    },
    footerQuote: {
      fontSize: 20,
      fontWeight: '600',
      fontStyle: 'italic',
      color: colors.absolute.white,
      textAlign: 'center',
      lineHeight: 32,
    },
    divider: {
      height: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      width: 60,
      marginVertical: 16,
    },
    footerSource: {
      fontSize: 14,
      color: 'rgba(255, 255, 255, 0.7)',
      textAlign: 'center',
    },
  });
