import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UnifiedHeader } from '../../src/components/shared/UnifiedHeader';
import { MiniPlayer } from '../../src/components/music/MiniPlayer';

export default function SharedLayout() {
  const { t } = useTranslation();

  const getTitle = (routeName: string): string => {
    const titleKeys: Record<string, string> = {
      settings: 'settings.title',
      auth: 'settingsPage.signUpOrLogin',
      language: 'settingsPage.language',
      help: 'settingsPage.help',
      consent: 'settingsPage.consent',
      'explicit-content': 'settingsPage.explicitContent',
      preferences: 'settingsPage.preferences',
    };
    return t(titleKeys[routeName] || routeName);
  };

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: true,
          header: ({ route }) => {
            return <UnifiedHeader title={getTitle(route.name)} showBackButton />;
          },
        }}
      >
        <Stack.Screen
          name="settings"
          options={{
            title: t('settings.title'),
          }}
        />
        <Stack.Screen
          name="auth"
          options={{
            title: t('settingsPage.signUpOrLogin'),
          }}
        />
        <Stack.Screen
          name="language"
          options={{
            title: t('settingsPage.language'),
          }}
        />
        <Stack.Screen
          name="help"
          options={{
            title: t('settingsPage.help'),
          }}
        />
        <Stack.Screen
          name="consent"
          options={{
            title: t('settingsPage.consent'),
          }}
        />
        <Stack.Screen
          name="explicit-content"
          options={{
            title: t('settingsPage.explicitContent'),
          }}
        />
        <Stack.Screen
          name="preferences"
          options={{
            title: t('settingsPage.preferences'),
          }}
        />
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
