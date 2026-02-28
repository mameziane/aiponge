import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UnifiedHeader } from '../../src/components/shared/UnifiedHeader';
import { MiniPlayer } from '../../src/components/music/MiniPlayer';

export default function CommerceLayout() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: true,
          header: ({ options }) => (
            <UnifiedHeader title={options.title || ''} showBackButton />
          ),
        }}
      >
        <Stack.Screen name="credits-plan" options={{ title: t('navigation.creditsAndPlan') }} />
        <Stack.Screen name="credits" options={{ title: t('navigation.credits') }} />
        <Stack.Screen name="store" options={{ title: t('navigation.store') }} />
        <Stack.Screen name="subscription" options={{ title: t('subscription.title') }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="gift-history" options={{ headerShown: false }} />
      </Stack>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
