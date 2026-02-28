import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UnifiedHeader } from '../../src/components/shared/UnifiedHeader';
import { MiniPlayer } from '../../src/components/music/MiniPlayer';

export default function UserSettingsLayout() {
  const { t } = useTranslation();

  const getTitle = (routeName: string): string => {
    const titleKeys: Record<string, string> = {
      ethics: 'settingsPage.ethicsValues',
      'activity-calendar': 'activityCalendar.title',
      reminders: 'reminders.title',
      reports: 'screens.reports.title',
      manifesto: 'manifesto.title',
      profile: 'navigation.profile',
      reflect: 'navigation.reflect',
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
          name="ethics"
          options={{
            title: t('settingsPage.ethicsValues'),
          }}
        />
        <Stack.Screen
          name="manifesto"
          options={{
            title: t('manifesto.title'),
          }}
        />
        <Stack.Screen
          name="profile"
          options={{
            title: t('navigation.profile'),
          }}
        />
        <Stack.Screen
          name="activity-calendar"
          options={{
            title: t('activityCalendar.title'),
          }}
        />
        <Stack.Screen
          name="reminders"
          options={{
            title: t('reminders.title'),
          }}
        />
        <Stack.Screen
          name="reports"
          options={{
            title: t('screens.reports.title', { defaultValue: 'Reports' }),
          }}
        />
        <Stack.Screen
          name="reflect"
          options={{
            title: t('navigation.reflect'),
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
