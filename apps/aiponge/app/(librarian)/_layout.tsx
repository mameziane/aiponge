import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { Tabs, Redirect, router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useThemeColors } from '../../src/theme';
import { useAuthStore } from '../../src/auth/store';
import { useShallow } from 'zustand/react/shallow';
import { useIsLibrarian } from '../../src/hooks/admin/useAdminQuery';
import { AppTabBar } from '../../src/components/shared/AppTabBar';
import { UnifiedHeader } from '../../src/components/shared/UnifiedHeader';
import { useTranslation } from '../../src/i18n';
export const unstable_settings = {
  initialRouteName: 'books',
};

export const LibrarianCreateContext = React.createContext<{
  bookCreationTrigger: number;
  triggerBookCreation: () => void;
  musicCreationTrigger: number;
  triggerMusicCreation: () => void;
}>({
  bookCreationTrigger: 0,
  triggerBookCreation: () => {},
  musicCreationTrigger: 0,
  triggerMusicCreation: () => {},
});

export default function LibrarianLayout() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const pathname = usePathname();
  const { status, isAuthenticated, roleVerified } = useAuthStore(
    useShallow(state => ({
      status: state.status,
      isAuthenticated: state.isAuthenticated,
      roleVerified: state.roleVerified,
    }))
  );
  const isLibrarian = useIsLibrarian();
  const isAuthLoading = status === 'loading' || status === 'idle';
  const isRoleLoading = isAuthenticated && !roleVerified;

  const [bookCreationTrigger, setBookCreationTrigger] = useState(0);
  const [musicCreationTrigger, setMusicCreationTrigger] = useState(0);
  const [lastContentTab, setLastContentTab] = useState<'books' | 'music'>('books');
  const pendingTriggerRef = useRef<'books' | 'music' | null>(null);

  const isOnLibraryTab = pathname.includes('library');
  const isOnBooksTab = pathname.includes('books');
  const isOnDiscoverTab = pathname.includes('discover');

  useEffect(() => {
    if (isOnBooksTab) setLastContentTab('books');
    else if (isOnLibraryTab || isOnDiscoverTab) setLastContentTab('music');
  }, [isOnBooksTab, isOnLibraryTab, isOnDiscoverTab]);

  useEffect(() => {
    if (pendingTriggerRef.current && (isOnBooksTab || isOnLibraryTab)) {
      const target = pendingTriggerRef.current;
      pendingTriggerRef.current = null;
      if (target === 'books' && isOnBooksTab) {
        setBookCreationTrigger(prev => prev + 1);
      } else if (target === 'music' && isOnLibraryTab) {
        setMusicCreationTrigger(prev => prev + 1);
      }
    }
  }, [isOnBooksTab, isOnLibraryTab]);

  const contextValue = useMemo(
    () => ({
      bookCreationTrigger,
      triggerBookCreation: () => setBookCreationTrigger(prev => prev + 1),
      musicCreationTrigger,
      triggerMusicCreation: () => setMusicCreationTrigger(prev => prev + 1),
    }),
    [bookCreationTrigger, musicCreationTrigger]
  );

  const handleCreatePress = useCallback(() => {
    if (isOnDiscoverTab || lastContentTab === 'music') {
      if (isOnLibraryTab) {
        setMusicCreationTrigger(prev => prev + 1);
      } else {
        router.push('/(librarian)/create' as any);
      }
    } else {
      if (isOnBooksTab) {
        setBookCreationTrigger(prev => prev + 1);
      } else {
        pendingTriggerRef.current = 'books';
        router.navigate('/(librarian)/books' as any);
      }
    }
  }, [lastContentTab, isOnLibraryTab, isOnBooksTab, isOnDiscoverTab]);

  const getCreateLabel = (): string => {
    if (isOnDiscoverTab || lastContentTab === 'music') {
      return t('navigation.tabSong') || 'Song';
    }
    return t('navigation.tabBook') || 'Book';
  };

  if (isAuthLoading || isRoleLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.background.primary,
        }}
      >
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!isLibrarian) {
    return <Redirect href={'/(user)/books' as any} />;
  }

  return (
    <LibrarianCreateContext.Provider value={contextValue}>
      <Tabs
        initialRouteName="books"
        tabBar={props => <AppTabBar {...props} />}
        screenOptions={({ route }) => ({
          headerShown: true,
          header: () => {
            const titleKeys: Record<string, string> = {
              books: 'librarian.tabs.books',
              music: 'librarian.tabs.music',
              library: 'librarian.tabs.studio',
              config: 'librarian.tabs.settings',
              create: 'navigation.newSong',
              discover: 'navigation.newSong',
            };
            return <UnifiedHeader title={t(titleKeys[route.name] || 'librarian.tabs.books')} />;
          },
          tabBarStyle: {
            backgroundColor: colors.background.primary,
            borderTopColor: colors.border.primary,
            borderTopWidth: 1,
            paddingHorizontal: 0,
            paddingTop: 8,
            paddingBottom: 12,
            height: 70,
            overflow: 'visible',
          },
          tabBarItemStyle: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
          },
          tabBarActiveTintColor: colors.brand.primary,
          tabBarInactiveTintColor: colors.text.secondary,
        })}
      >
        {/* Hidden screens */}
        <Tabs.Screen
          name="index"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="create"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            href: null,
          }}
        />
        {/* Visible tabs: Books | Music | + Create | Library | Settings */}
        <Tabs.Screen
          name="books"
          options={{
            title: t('librarian.tabs.books') || 'Books',
            tabBarIcon: ({ color, size = 24, focused }) => (
              <Ionicons name={focused ? 'book' : 'book-outline'} color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="music"
          options={{
            title: t('librarian.tabs.music') || 'Music',
            tabBarIcon: ({ color, size = 24, focused }) => (
              <Ionicons name={focused ? 'musical-notes' : 'musical-notes-outline'} color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="new"
          options={{
            title: getCreateLabel(),
            tabBarLabelStyle: styles.createLabel,
            tabBarIcon: ({ color }) => (
              <View style={styles.createIconWrapper}>
                <Ionicons name="add-circle" color={color} size={36} />
              </View>
            ),
            tabBarItemStyle: {
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              overflow: 'visible',
            },
          }}
          listeners={{
            tabPress: e => {
              e.preventDefault();
              handleCreatePress();
            },
          }}
        />
        <Tabs.Screen
          name="library"
          options={{
            title: t('librarian.tabs.studio') || 'Studio',
            tabBarIcon: ({ color, size = 24, focused }) => (
              <Ionicons name={focused ? 'color-palette' : 'color-palette-outline'} color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="config"
          options={{
            title: t('librarian.tabs.settings') || 'Settings',
            tabBarIcon: ({ color, size = 24, focused }) => (
              <Ionicons name={focused ? 'settings' : 'settings-outline'} color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </LibrarianCreateContext.Provider>
  );
}

const styles = StyleSheet.create({
  createIconWrapper: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  createLabel: {
    fontSize: 10,
    marginTop: 2,
  },
});
