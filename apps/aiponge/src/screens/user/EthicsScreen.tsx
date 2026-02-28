import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { LiquidGlassCard } from '../../components/ui';

interface EthicsSection {
  number: string;
  titleKey: string;
  descriptionKey: string;
  bulletKeys?: string[];
  icon: keyof typeof Ionicons.glyphMap;
}

const sections: EthicsSection[] = [
  {
    number: '1',
    titleKey: 'ethics.section1.title',
    descriptionKey: 'ethics.section1.description',
    bulletKeys: ['ethics.section1.bullet1', 'ethics.section1.bullet2', 'ethics.section1.bullet3'],
    icon: 'musical-notes',
  },
  {
    number: '2',
    titleKey: 'ethics.section2.title',
    descriptionKey: 'ethics.section2.description',
    bulletKeys: [
      'ethics.section2.bullet1',
      'ethics.section2.bullet2',
      'ethics.section2.bullet3',
      'ethics.section2.bullet4',
      'ethics.section2.bullet5',
    ],
    icon: 'heart',
  },
  {
    number: '3',
    titleKey: 'ethics.section3.title',
    descriptionKey: 'ethics.section3.description',
    icon: 'people',
  },
  {
    number: '4',
    titleKey: 'ethics.section4.title',
    descriptionKey: 'ethics.section4.description',
    bulletKeys: [
      'ethics.section4.bullet1',
      'ethics.section4.bullet2',
      'ethics.section4.bullet3',
      'ethics.section4.bullet4',
    ],
    icon: 'shield-checkmark',
  },
  {
    number: '5',
    titleKey: 'ethics.section5.title',
    descriptionKey: 'ethics.section5.description',
    bulletKeys: [
      'ethics.section5.bullet1',
      'ethics.section5.bullet2',
      'ethics.section5.bullet3',
      'ethics.section5.bullet4',
    ],
    icon: 'lock-closed',
  },
  {
    number: '6',
    titleKey: 'ethics.section6.title',
    descriptionKey: 'ethics.section6.description',
    bulletKeys: [
      'ethics.section6.bullet1',
      'ethics.section6.bullet2',
      'ethics.section6.bullet3',
      'ethics.section6.bullet4',
    ],
    icon: 'eye',
  },
  {
    number: '7',
    titleKey: 'ethics.section7.title',
    descriptionKey: 'ethics.section7.description',
    icon: 'leaf',
  },
  {
    number: '8',
    titleKey: 'ethics.section8.title',
    descriptionKey: 'ethics.section8.description',
    bulletKeys: [
      'ethics.section8.bullet1',
      'ethics.section8.bullet2',
      'ethics.section8.bullet3',
      'ethics.section8.bullet4',
      'ethics.section8.bullet5',
    ],
    icon: 'person',
  },
];

export function EthicsScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        testID="ethics-page"
      >
        <View style={styles.sectionsContainer}>
          {sections.map((section, index) => (
            <LiquidGlassCard
              key={index}
              intensity="medium"
              padding={20}
              borderRadius={16}
              style={styles.section}
              testID={`ethics-section-${index}`}
            >
              <View style={styles.sectionHeader}>
                <View style={styles.iconCircle}>
                  <Ionicons name={section.icon} size={24} color={colors.brand.primary} />
                </View>
                <Text style={styles.sectionTitle}>{t(section.titleKey)}</Text>
              </View>

              <Text style={styles.sectionDescription}>{t(section.descriptionKey)}</Text>

              {section.bulletKeys && (
                <View style={styles.bulletList}>
                  {section.bulletKeys.map((bulletKey, bulletIndex) => (
                    <View key={bulletIndex} style={styles.bulletItem}>
                      <View style={styles.bulletDot} />
                      <Text style={styles.bulletText}>{t(bulletKey)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </LiquidGlassCard>
          ))}
        </View>

        <LinearGradient
          colors={colors.gradients.primary}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.commitment}
        >
          <Text style={styles.commitmentTitle}>{t('ethics.commitment.title')}</Text>
          <Text style={styles.commitmentText}>{t('ethics.commitment.text')}</Text>
          <View style={styles.divider} />
          <Text style={styles.commitmentTagline}>{t('ethics.commitment.tagline')}</Text>
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
      marginRight: 12,
    },
    sectionTitle: {
      flex: 1,
      fontSize: 22,
      fontWeight: '600',
      color: colors.text.primary,
    },
    sectionDescription: {
      fontSize: 16,
      lineHeight: 26,
      color: colors.text.secondary,
      marginBottom: 12,
    },
    bulletList: {
      marginTop: 8,
    },
    bulletItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 8,
      paddingLeft: 8,
    },
    bulletDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.brand.primary,
      marginTop: 8,
      marginRight: 12,
    },
    bulletText: {
      flex: 1,
      fontSize: 15,
      lineHeight: 24,
      color: colors.text.secondary,
    },
    commitment: {
      marginHorizontal: 20,
      marginTop: 16,
      padding: 24,
      borderRadius: BORDER_RADIUS.lg,
    },
    commitmentTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.absolute.white,
      marginBottom: 12,
    },
    commitmentText: {
      fontSize: 15,
      lineHeight: 24,
      color: 'rgba(255, 255, 255, 0.9)',
      textAlign: 'center',
    },
    divider: {
      height: 1,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      marginVertical: 16,
    },
    commitmentTagline: {
      fontSize: 16,
      fontStyle: 'italic',
      color: 'rgba(255, 255, 255, 0.95)',
      textAlign: 'center',
    },
  });
