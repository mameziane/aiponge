import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors, type ColorScheme, commonStyles, BORDER_RADIUS } from '../../theme';
import { LiquidGlassCard } from '../../components/ui';
import { useSettings } from '../../hooks/system/useSettings';

export function ExplicitContentScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  const { settings, updateExplicitContentFilter, updateProfanityFilter, updateViolenceFilter } = useSettings();

  const handleExplicitContentChange = (value: boolean) => {
    updateExplicitContentFilter(value);
  };

  const handleProfanityChange = (value: boolean) => {
    updateProfanityFilter(value);
  };

  const handleViolenceChange = (value: boolean) => {
    updateViolenceFilter(value);
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.content} testID="explicit-content-page">
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={24} color={colors.semantic.warning} />
            <Text style={styles.warningText}>{t('explicitContent.warning')}</Text>
          </View>

          <Text style={styles.sectionTitle}>{t('explicitContent.filterSettings')}</Text>

          <LiquidGlassCard intensity="subtle" padding={16} style={styles.filterItem}>
            <View style={styles.filterItemRow}>
              <View style={styles.filterInfo}>
                <View style={styles.filterHeader}>
                  <Ionicons name="volume-high-outline" size={20} color={colors.brand.primary} />
                  <Text style={styles.filterTitle}>{t('explicitContent.explicit.title')}</Text>
                </View>
                <Text style={styles.filterDescription}>{t('explicitContent.explicit.description')}</Text>
              </View>
              <Switch
                value={settings.explicitContentFilter}
                onValueChange={handleExplicitContentChange}
                trackColor={{ false: colors.border.primary, true: colors.brand.primary }}
                thumbColor={colors.absolute.white}
                testID="toggle-explicit-content"
              />
            </View>
          </LiquidGlassCard>

          <LiquidGlassCard intensity="subtle" padding={16} style={styles.filterItem}>
            <View style={styles.filterItemRow}>
              <View style={styles.filterInfo}>
                <View style={styles.filterHeader}>
                  <Ionicons name="chatbubble-outline" size={20} color={colors.brand.primary} />
                  <Text style={styles.filterTitle}>{t('explicitContent.profanity.title')}</Text>
                </View>
                <Text style={styles.filterDescription}>{t('explicitContent.profanity.description')}</Text>
              </View>
              <Switch
                value={settings.profanityFilter}
                onValueChange={handleProfanityChange}
                trackColor={{ false: colors.border.primary, true: colors.brand.primary }}
                thumbColor={colors.absolute.white}
                testID="toggle-profanity"
              />
            </View>
          </LiquidGlassCard>

          <LiquidGlassCard intensity="subtle" padding={16} style={styles.filterItem}>
            <View style={styles.filterItemRow}>
              <View style={styles.filterInfo}>
                <View style={styles.filterHeader}>
                  <Ionicons name="skull-outline" size={20} color={colors.brand.primary} />
                  <Text style={styles.filterTitle}>{t('explicitContent.violence.title')}</Text>
                </View>
                <Text style={styles.filterDescription}>{t('explicitContent.violence.description')}</Text>
              </View>
              <Switch
                value={settings.violenceFilter}
                onValueChange={handleViolenceChange}
                trackColor={{ false: colors.border.primary, true: colors.brand.primary }}
                thumbColor={colors.absolute.white}
                testID="toggle-violence"
              />
            </View>
          </LiquidGlassCard>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={20} color={colors.semantic.info} />
            <Text style={styles.infoText}>{t('explicitContent.infoNote')}</Text>
          </View>
        </View>
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
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    content: commonStyles.flexOne,
    warningBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.semantic.warningLight,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginBottom: 24,
    },
    warningText: {
      flex: 1,
      fontSize: 14,
      color: colors.text.dark,
      marginLeft: 12,
      lineHeight: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text.primary,
      marginBottom: 16,
    },
    filterItem: {
      marginBottom: 12,
    },
    filterItemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    filterInfo: {
      flex: 1,
      marginRight: 16,
    },
    filterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    filterTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
      marginLeft: 8,
    },
    filterDescription: {
      fontSize: 14,
      color: colors.text.tertiary,
      lineHeight: 20,
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: colors.semantic.infoLight,
      borderRadius: BORDER_RADIUS.md,
      padding: 16,
      marginTop: 24,
    },
    infoText: {
      flex: 1,
      fontSize: 14,
      color: colors.text.dark,
      marginLeft: 12,
      lineHeight: 20,
    },
  });
