import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../src/theme';
import { useAuthStore } from '../../src/auth/store';
import { useShallow } from 'zustand/react/shallow';
import { useIsAdmin } from '../../src/hooks/admin/useAdminQuery';
import { AppTabBar } from '../../src/components/shared/AppTabBar';
import { UnifiedHeader } from '../../src/components/shared/UnifiedHeader';
import { AdminCreateProvider } from '../../src/contexts/AdminCreateContext';

export default function AdminLayout() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const { status, isAuthenticated, roleVerified } = useAuthStore(useShallow((state) => ({ status: state.status, isAuthenticated: state.isAuthenticated, roleVerified: state.roleVerified })));
  const isAdmin = useIsAdmin();
  const isAuthLoading = status === 'loading' || status === 'idle';
  const isRoleLoading = isAuthenticated && !roleVerified;

  if (isAuthLoading || isRoleLoading) {
    return (
      <View style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background.primary,
      }}>
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!isAdmin) {
    return <Redirect href={"/(user)/books" as any} />;
  }

  const getTabTitle = (routeName: string): string => {
    const titleKeys: Record<string, string> = {
      dashboard: 'navigation.dashboard',
      systems: 'navigation.config',
      insights: 'navigation.insights',
      governance: 'navigation.governance',
      profile: 'navigation.profile',
    };
    return t(titleKeys[routeName] || routeName);
  };

  return (
    <AdminCreateProvider>
    <Tabs
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerShown: true,
        header: () => <UnifiedHeader title={getTabTitle(route.name)} />,
        tabBarStyle: {
          backgroundColor: colors.background.primary,
          borderTopColor: colors.border.primary,
          borderTopWidth: 1,
          paddingHorizontal: 0,
          paddingTop: 8,
          paddingBottom: 12,
          height: 70,
        },
        tabBarActiveTintColor: colors.brand.primary,
        tabBarInactiveTintColor: colors.text.secondary,
      })}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('navigation.dashboard'),
          tabBarIcon: ({ color, size = 24, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="systems"
        options={{
          title: t('navigation.config'),
          tabBarIcon: ({ color, size = 24, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('navigation.insights'),
          tabBarIcon: ({ color, size = 24, focused }) => (
            <Ionicons name={focused ? "analytics" : "analytics-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="governance"
        options={{
          title: t('navigation.governance'),
          tabBarIcon: ({ color, size = 24, focused }) => (
            <Ionicons name={focused ? "shield" : "shield-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
    </Tabs>
    </AdminCreateProvider>
  );
}
