import { Tabs, useRouter, usePathname, Redirect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../src/theme';
import { UnifiedHeader } from '../../src/components/shared/UnifiedHeader';
import { AppTabBar } from '../../src/components/shared/AppTabBar';
import { View, StyleSheet, Text, Alert } from 'react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { setLastVisitedTab } from '../../src/stores';
import { getUserModeActive, setUserModeActive } from '../../src/stores';
import { useIsLibrarian, useIsAdmin } from '../../src/hooks/admin/useAdminQuery';
import { useAuthStore, selectAuthAndRole } from '../../src/auth/store';
import { useShallow } from 'zustand/react/shallow';
import { QueueAutoAdvanceController } from '../../src/components/music/QueueAutoAdvanceController';
import { AuthPlaybackController } from '../../src/components/auth/AuthPlaybackController';
import { TrackAlarmHandler } from '../../src/components/music/TrackAlarmHandler';
import { PushNotificationInitializer } from '../../src/components/system/PushNotificationInitializer';
import { ShareIntentHandler } from '../../src/components/system/ShareIntentHandler';
import { useProfile } from '../../src/hooks/profile/useProfile';
import { useSubscriptionData } from '../../src/contexts/SubscriptionContext';
import { isProfessionalTier } from '@aiponge/shared-contracts';

// Selection context type for book screen
export type BookSelectionContext = 
  | 'no-books'         // No books exist
  | 'book'             // Book is selected/opened (default when books exist)
  | 'chapter'          // Chapter is expanded/selected
  | 'entry';           // Entry is selected/opened

// Context for chapter modal and entry creation triggers
export const ChapterModalContext = React.createContext<{
  triggerChapterModal: () => void;
  chapterModalTrigger: number;
  triggerEntryCreation: () => void;
  entryCreationTrigger: number;
  triggerSongCreation: () => void;
  songCreationTrigger: number;
  triggerBookCreation: () => void;
  bookCreationTrigger: number;
  bookViewMode: 'chapters' | 'entries';
  setBookViewMode: (mode: 'chapters' | 'entries') => void;
  selectionContext: BookSelectionContext;
  setSelectionContext: (context: BookSelectionContext) => void;
  selectedEntryId: string | null;
  setSelectedEntryId: (id: string | null) => void;
  bookCount: number;
  setBookCount: (count: number) => void;
}>({
  triggerChapterModal: () => {},
  chapterModalTrigger: 0,
  triggerEntryCreation: () => {},
  entryCreationTrigger: 0,
  triggerSongCreation: () => {},
  songCreationTrigger: 0,
  triggerBookCreation: () => {},
  bookCreationTrigger: 0,
  bookViewMode: 'chapters',
  setBookViewMode: () => {},
  selectionContext: 'book',
  setSelectionContext: () => {},
  selectedEntryId: null,
  setSelectedEntryId: () => {},
  bookCount: -1,
  setBookCount: () => {},
});

export default function TabLayout() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const router = useRouter();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ userMode?: string }>();
  const [chapterModalTrigger, setChapterModalTrigger] = React.useState(0);
  const [entryCreationTrigger, setEntryCreationTrigger] = React.useState(0);
  const [songCreationTrigger, setSongCreationTrigger] = React.useState(0);
  const [bookCreationTrigger, setBookCreationTrigger] = React.useState(0);
  const [bookViewMode, setBookViewMode] = React.useState<'chapters' | 'entries'>('chapters');
  const [selectionContext, setSelectionContext] = React.useState<BookSelectionContext>('book');
  const [selectedEntryId, setSelectedEntryId] = React.useState<string | null>(null);
  const [bookCount, setBookCount] = React.useState(-1);
  const [userModeActiveState, setUserModeActiveState] = useState<boolean | null>(null);

  const { isAuthenticated, roleVerified } = useAuthStore(useShallow(selectAuthAndRole));
  const isLibrarian = useIsLibrarian();
  const isAdmin = useIsAdmin();
  const isLibrarianOnly = isLibrarian && !isAdmin;
  const { profileData } = useProfile();
  const hasEntries = (profileData?.stats?.totalEntries ?? 0) > 0;
  const { currentTier } = useSubscriptionData();
  const isPro = isProfessionalTier(currentTier);

  useEffect(() => {
    getUserModeActive().then(setUserModeActiveState);
  }, []);

  useEffect(() => {
    if (params.userMode === 'true' && userModeActiveState !== true) {
      setUserModeActive(true);
      setUserModeActiveState(true);
    }
  }, [params.userMode, userModeActiveState]);

  useEffect(() => {
    if (pathname) {
      setLastVisitedTab(pathname);
    }
  }, [pathname]);

  const triggerChapterModal = React.useCallback(() => setChapterModalTrigger(prev => prev + 1), []);
  const triggerEntryCreation = React.useCallback(() => setEntryCreationTrigger(prev => prev + 1), []);
  const triggerSongCreation = React.useCallback(() => setSongCreationTrigger(prev => prev + 1), []);
  const triggerBookCreation = React.useCallback(() => setBookCreationTrigger(prev => prev + 1), []);

  const handleCreatePress = useCallback(() => {
    if (pathname.includes('books') && isPro) {
      triggerBookCreation();
    } else if (pathname.includes('books')) {
      router.push('/create');
    } else if (pathname.includes('reflect')) {
      router.push('/reflect?tab=insights');
    } else {
      router.push('/create');
    }
  }, [pathname, router, isPro, triggerBookCreation]);

  const getTabTitle = useCallback((routeName: string): string => {
    const titleKeys: Record<string, string> = {
      create: 'navigation.create',
      music: 'navigation.myMusic',
      books: 'navigation.myBooks',
      reflect: 'navigation.reflect',
      reports: 'navigation.reports',
    };
    return t(titleKeys[routeName] || routeName);
  }, [t]);

  const tabBarStyle = useMemo(() => ({
    backgroundColor: colors.background.primary,
    borderTopColor: colors.border.primary,
    borderTopWidth: 1,
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 12,
    height: 70,
    overflow: 'visible' as const,
  }), [colors.background.primary, colors.border.primary]);

  const tabBarItemStyle = useMemo(() => ({
    flex: 1,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  }), []);

  const renderTabBar = useCallback(
    (props: React.ComponentProps<typeof AppTabBar>) => <AppTabBar {...props} />,
    []
  );

  const screenOptions = useCallback(({ route }: { route: { name: string } }) => ({
    freezeOnBlur: true,
    headerShown: true,
    header: () => <UnifiedHeader title={getTabTitle(route.name)} />,
    tabBarStyle,
    tabBarItemStyle,
    tabBarActiveTintColor: colors.text.primary,
    tabBarInactiveTintColor: colors.text.secondary,
  }), [getTabTitle, tabBarStyle, tabBarItemStyle, colors.text.primary, colors.text.secondary]);

  const contextValue = React.useMemo(() => ({
    triggerChapterModal,
    chapterModalTrigger,
    triggerEntryCreation,
    entryCreationTrigger,
    triggerSongCreation,
    songCreationTrigger,
    triggerBookCreation,
    bookCreationTrigger,
    bookViewMode,
    setBookViewMode,
    selectionContext,
    setSelectionContext,
    selectedEntryId,
    setSelectedEntryId,
    bookCount,
    setBookCount,
  }), [triggerChapterModal, chapterModalTrigger, triggerEntryCreation, entryCreationTrigger, triggerSongCreation, songCreationTrigger, triggerBookCreation, bookCreationTrigger, bookViewMode, selectionContext, selectedEntryId, bookCount]);

  if (userModeActiveState === null) {
    return <View style={{ flex: 1, backgroundColor: colors.background.primary }} />;
  }

  if (isAuthenticated && roleVerified && isLibrarianOnly && !userModeActiveState) {
    return <Redirect href="/(librarian)/discover" />;
  }

  return (
    <ChapterModalContext.Provider value={contextValue}>
      <QueueAutoAdvanceController />
      <AuthPlaybackController />
      <TrackAlarmHandler />
      <PushNotificationInitializer />
      <ShareIntentHandler />
      <Tabs
        tabBar={renderTabBar}
        screenOptions={screenOptions}
    >
      <Tabs.Screen
        name="music"
        options={{
          title: t('navigation.myMusic'),
          tabBarIcon: ({ color, size = 24, focused }) => (
            <Ionicons name={focused ? "musical-notes" : "musical-notes-outline"} color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="books"
        options={{
          title: t('navigation.myBooks'),
          tabBarIcon: ({ color, size = 24, focused }) => <Ionicons name={focused ? "book" : "book-outline"} color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: pathname.includes('books') && isPro
            ? t('navigation.tabBook')
            : pathname.includes('books')
            ? t('navigation.tabEntry')
            : pathname.includes('reflect')
            ? t('navigation.tabInsight')
            : pathname.includes('music')
            ? t('navigation.tabSong')
            : t('navigation.tabCreate'),
          tabBarLabelStyle: [
            styles.bookLabel,
            pathname.includes('create') && { opacity: 0.4 },
          ],
          tabBarIcon: ({ focused }) => (
            <View style={[styles.createIconWrapper, pathname.includes('create') && { opacity: 0.4 }]}>
              <Ionicons name="add-circle" color={colors.text.primary} size={48} />
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
          tabPress: (e) => {
            e.preventDefault();
            if (!pathname.includes('create')) {
              handleCreatePress();
            }
          },
        }}
      />
      <Tabs.Screen
        name="reflect"
        options={{
          title: t('navigation.reflect'),
          tabBarIcon: ({ color, size = 24, focused }) => (
            <Ionicons
              name={focused ? "bulb" : "bulb-outline"}
              color={hasEntries ? color : colors.text.tertiary}
              size={size}
            />
          ),
          tabBarLabelStyle: !hasEntries ? { color: colors.text.tertiary } : undefined,
        }}
        listeners={{
          tabPress: (e) => {
            if (!hasEntries) {
              e.preventDefault();
              Alert.alert(
                t('navigation.reflectDisabledTitle'),
                t('navigation.reflectDisabledMessage'),
              );
            }
          },
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: t('navigation.reports'),
          tabBarIcon: ({ color, size = 24, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} color={color} size={size} />
          ),
        }}
      />
      {/* Stack screens - hidden from tab bar but accessible via navigation */}
      <Tabs.Screen
        name="creator-dashboard"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="studio"
        options={{
          href: null,
        }}
      />
    </Tabs>
    </ChapterModalContext.Provider>
  );
}

const styles = StyleSheet.create({
  createIconWrapper: {
    width: 52,
    height: 52,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -12,
  },
  bookLabel: {
    fontSize: 10,
    marginTop: 2,
  },
});
