import { useMemo } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { SubscriptionTab } from '../../src/components/commerce/SubscriptionTabScreen';
import { useThemeColors, type ColorScheme } from '../../src/theme';

export default function SubscriptionScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <SubscriptionTab />
    </SafeAreaView>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
  });
