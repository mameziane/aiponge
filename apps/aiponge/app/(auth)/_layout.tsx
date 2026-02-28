import { Stack } from 'expo-router';
import { Platform } from 'react-native';
import { useThemeColors } from '../../src/theme';

const iosVersionMajor = Platform.OS === 'ios' ? parseInt(String(Platform.Version).split('.')[0], 10) : 0;
const isIOS26OrLater = iosVersionMajor >= 26;

export default function AuthLayout() {
  const colors = useThemeColors();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: colors.background.primary,
        },
        animation: isIOS26OrLater ? 'none' : 'fade',
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="sms-verify" />
    </Stack>
  );
}
