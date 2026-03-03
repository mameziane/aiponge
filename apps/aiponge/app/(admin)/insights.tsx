import { View, Text, TouchableOpacity, Appearance, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors as darkColors } from '../../src/theme';
import { lightColors } from '../../src/theme/lightColors';
import { i18n } from '../../src/i18n';

export { default } from '../../src/screens/admin/InsightsScreen';

/**
 * Route-level ErrorBoundary (Expo Router convention).
 * Catches render errors within the Insights screen so they stay local
 * instead of cascading to the root ErrorBoundary and losing admin navigation state.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  const scheme = Appearance.getColorScheme();
  const themeColors = scheme === 'light' ? lightColors : darkColors;

  const title = (() => {
    try {
      return i18n.t('errorBoundary.title');
    } catch {
      return 'Something went wrong';
    }
  })();
  const message = (() => {
    try {
      return i18n.t('errorBoundary.message');
    } catch {
      return 'An unexpected error occurred. Please try again.';
    }
  })();
  const tryAgain = (() => {
    try {
      return i18n.t('errorBoundary.tryAgain');
    } catch {
      return 'Try Again';
    }
  })();

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background.primary }]}>
      <Ionicons name="warning-outline" size={48} color={themeColors.semantic.error} />
      <Text style={[styles.title, { color: themeColors.text.primary }]}>{title}</Text>
      <Text style={[styles.message, { color: themeColors.text.secondary }]}>{message}</Text>
      {error?.message ? (
        <Text style={[styles.errorDetail, { color: themeColors.semantic.error }]} selectable>
          {error.message}
        </Text>
      ) : null}
      <TouchableOpacity style={[styles.button, { backgroundColor: themeColors.brand.primary }]} onPress={retry}>
        <Text style={styles.buttonText}>{tryAgain}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  errorDetail: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
