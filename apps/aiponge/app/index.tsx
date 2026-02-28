import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuthStore, selectIsAuthenticated, selectIsAuthReady, selectUser, selectRoleVerified } from '../src/auth';
import { useThemeColors } from '../src/theme';
import { Onboarding } from '../src/components/auth/Onboarding';
import { hasCompletedOnboarding } from '../src/utils/onboarding';
import { getLastVisitedTab, getUserModeActive } from '../src/stores';
import { USER_ROLES } from '@aiponge/shared-contracts';

export default function AuthGate() {
  const colors = useThemeColors();
  const [isReady, setIsReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [initialRoute, setInitialRoute] = useState<string | null>(null);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isAuthReady = useAuthStore(selectIsAuthReady);
  const user = useAuthStore(selectUser);
  const roleVerified = useAuthStore(selectRoleVerified);

  useEffect(() => {
    if (isAuthReady) {
      setIsReady(true);
      if (!isAuthenticated) {
        setOnboardingChecked(true);
      }
    }
  }, [isAuthReady, isAuthenticated]);

  useEffect(() => {
    async function checkOnboardingAndRoute() {
      if (!user) return;
      
      console.log('[AuthGate] Checking onboarding status for user:', user.id, 'isGuest:', user.isGuest);
      
      const lastTab = await getLastVisitedTab();
      console.log('[AuthGate] Last visited tab:', lastTab);
      
      const completed = await hasCompletedOnboarding(user.id, user.isGuest);
      console.log('[AuthGate] User (ID:', user.id, ', isGuest:', user.isGuest, ') - onboarding completed:', completed);
      setShowOnboarding(!completed);
      
      const isLibrarianOrAdmin = user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.LIBRARIAN;
      const isAdmin = user.role === USER_ROLES.ADMIN;
      const isLibrarianOnly = isLibrarianOrAdmin && !isAdmin;

      let layoutPrefix = '/(user)';
      if (isLibrarianOnly) {
        const userModeActive = await getUserModeActive();
        if (!userModeActive) {
          layoutPrefix = '/(librarian)';
        }
      }

      console.log('[AuthGate] Role-based routing:', { role: user.role, layoutPrefix, isLibrarianOrAdmin });

      if (completed && lastTab) {
        console.log('[AuthGate] Returning user - routing to last tab:', lastTab);
        if (layoutPrefix === '/(librarian)') {
          const librarianTabs = ['books', 'music', 'library', 'discover'];
          const tabName = librarianTabs.includes(lastTab) ? lastTab : 'discover';
          setInitialRoute(`${layoutPrefix}/${tabName}`);
        } else {
          setInitialRoute(`${layoutPrefix}/${lastTab}`);
        }
      } else if (completed) {
        setInitialRoute(layoutPrefix === '/(librarian)' ? '/(librarian)/discover' : '/(user)/music');
      } else {
        setInitialRoute('/(user)/books');
      }
      
      setOnboardingChecked(true);
    }
    
    if (isReady && user?.id && roleVerified) {
      console.log('[AuthGate] isReady=true with valid user, checking onboarding and route');
      checkOnboardingAndRoute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, user?.id, user?.isGuest, roleVerified]);

  const handleOnboardingComplete = async () => {
    try {
      console.log('[AuthGate] handleOnboardingComplete called - user:', user?.id, 'isGuest:', user?.isGuest);
      setShowOnboarding(false);
      const route = user?.isGuest ? '/(user)/music' : '/(user)/books?expandChapters=true';
      console.log('[AuthGate] Onboarding complete - setting initial route to:', route);
      setInitialRoute(route);
      console.log('[AuthGate] Initial route set successfully');
    } catch (err) {
      console.error('[AuthGate] handleOnboardingComplete ERROR:', err);
    }
  };

  if (!isReady || !onboardingChecked) {
    console.log('[AuthGate] Waiting... isReady:', isReady, 'onboardingChecked:', onboardingChecked);
    return (
      <View style={{
        flex: 1,
        backgroundColor: colors.background.primary,
        alignItems: 'center',
        justifyContent: 'center',
      }} testID="auth-loading">
        <ActivityIndicator size="large" color={colors.brand.primary} />
      </View>
    );
  }

  if (showOnboarding) {
    console.log('[AuthGate] Showing onboarding screen for user');
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (isAuthenticated && initialRoute) {
    console.log('[AuthGate] User authenticated, redirecting to:', initialRoute);
    return <Redirect href={initialRoute as any} />;
  }

  console.log('[AuthGate] User not authenticated, redirecting to welcome');
  return <Redirect href="/(auth)/welcome" />;
}
