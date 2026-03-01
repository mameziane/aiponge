/**
 * Subscription Context
 * Manages RevenueCat SDK initialization and subscription state
 * Following RevenueCat best practices for React Native
 *
 * Types, constants, and helper functions are in ./subscription.types.ts
 */

import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef, ReactNode } from 'react';
import {
  USER_ROLES,
  TIER_IDS,
  isPaidTier as isPaidTierCheck,
  normalizeTier,
  type TierId,
  type ServiceResponse,
} from '@aiponge/shared-contracts';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
  PurchasesStoreProduct,
  LOG_LEVEL,
  PurchasesError,
  PURCHASES_ERROR_CODE,
} from 'react-native-purchases';
import { apiClient, apiRequest } from '../lib/axiosApiClient';
import { Platform, Alert } from 'react-native';
import { useAuthStore, selectUserAndRole } from '../auth/store';
import { useShallow } from 'zustand/react/shallow';
import { logger } from '../lib/logger';
import { isExpoGo } from '../offline/offlineEnv';
import { useTranslation } from '../i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  REVENUECAT_ENTITLEMENTS,
  DEFAULT_CONFIG,
  CONFIG_CACHE_KEY,
  deriveGenerationLimit,
  deriveTierConfig,
  getBillingPeriodFromProductId,
  type SubscriptionTier,
  type BillingPeriod,
  type SubscriptionConfig,
  type SubscriptionDataValue,
  type SubscriptionActionsValue,
} from './subscription.types';

export { REVENUECAT_PRODUCT_IDS, getBillingPeriodFromProductId } from './subscription.types';
export type { BillingPeriod, SubscriptionTier, SubscriptionConfig } from './subscription.types';

const SubscriptionDataContext = createContext<SubscriptionDataValue | null>(null);
const SubscriptionActionsContext = createContext<SubscriptionActionsValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, roleVerified } = useAuthStore(useShallow(selectUserAndRole));
  const { t } = useTranslation();
  const [isInitialized, setIsInitialized] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [creditsOffering, setCreditsOffering] = useState<PurchasesOffering | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subscriptionConfig, setSubscriptionConfig] = useState<SubscriptionConfig>(DEFAULT_CONFIG);
  const [backendTier, setBackendTier] = useState<TierId | null>(null);

  // Track last user ID to prevent unnecessary reinitialization
  const lastUserIdRef = useRef<string | null>(null);
  // Store listener reference for proper cleanup
  const listenerRef = useRef<((info: CustomerInfo) => void) | null>(null);

  // Fetch backend subscription tier (database source of truth for tier)
  useEffect(() => {
    if (!user || user.isGuest) {
      setBackendTier(null);
      return;
    }
    const fetchBackendTier = async () => {
      try {
        const result = await apiClient.get<ServiceResponse<{ subscriptionTier?: string }>>(
          '/api/v1/app/subscriptions/status'
        );
        if (result.success && result.data?.subscriptionTier) {
          setBackendTier(normalizeTier(result.data.subscriptionTier));
        }
      } catch {
        logger.debug('Could not fetch backend subscription tier');
      }
    };
    fetchBackendTier();
  }, [user]);

  // Fetch subscription config from backend (Single Source of Truth)
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        // Try to load cached config first for faster startup
        const cachedConfig = await AsyncStorage.getItem(CONFIG_CACHE_KEY);
        if (cachedConfig) {
          setSubscriptionConfig(JSON.parse(cachedConfig));
        }

        // Fetch fresh config from backend
        try {
          const result = await apiRequest<{ success: boolean; data: typeof subscriptionConfig }>(
            '/api/v1/app/subscriptions/config'
          );
          const configData = result as unknown as { success: boolean; data: typeof subscriptionConfig };
          if (configData.success && configData.data) {
            setSubscriptionConfig(configData.data);
            await AsyncStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(configData.data));
            logger.info('Subscription config loaded from backend');
          }
        } catch {
          logger.debug('Could not fetch subscription config from backend, using cached/defaults');
        }
      } catch (error) {
        logger.warn('Failed to fetch subscription config, using cached/default values', { error: String(error) });
      }
    };

    fetchConfig();
  }, []);

  // Determine current subscription tier from RevenueCat entitlements + backend fallback
  const currentTier = useMemo<SubscriptionTier>(() => {
    if (!user || user.isGuest) {
      return TIER_IDS.GUEST;
    }

    if (roleVerified && (user.role === USER_ROLES.ADMIN || user.role === USER_ROLES.LIBRARIAN)) {
      return TIER_IDS.STUDIO;
    }

    if (customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENTS.STUDIO]) {
      return TIER_IDS.STUDIO;
    }
    if (customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENTS.PRACTICE]) {
      return TIER_IDS.PRACTICE;
    }
    if (customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENTS.PERSONAL]) {
      return TIER_IDS.PERSONAL;
    }

    if (backendTier && backendTier !== TIER_IDS.GUEST) {
      return backendTier;
    }

    return TIER_IDS.EXPLORER;
  }, [customerInfo, user, roleVerified, backendTier]);

  // Determine billing period from active subscription product
  const currentBillingPeriod = useMemo<BillingPeriod>(() => {
    const studioEntitlement = customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENTS.STUDIO];
    const practiceEntitlement = customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENTS.PRACTICE];
    const personalEntitlement = customerInfo?.entitlements.active[REVENUECAT_ENTITLEMENTS.PERSONAL];
    const activeEntitlement = studioEntitlement || practiceEntitlement || personalEntitlement;
    return getBillingPeriodFromProductId(activeEntitlement?.productIdentifier);
  }, [customerInfo]);

  // Get tier configuration from dynamic config
  const tierConfig = useMemo(() => {
    return deriveTierConfig(subscriptionConfig, currentTier);
  }, [currentTier, subscriptionConfig]);

  // Calculate generation limit based on tier and billing period
  const generationLimit = useMemo(() => {
    return deriveGenerationLimit(subscriptionConfig, currentTier, currentBillingPeriod);
  }, [currentTier, currentBillingPeriod, subscriptionConfig]);

  // Convenience accessors
  const canGenerateMusic = tierConfig.canGenerateMusic;

  // Memoize isPaidTier (any paid tier)
  const isPaidTier = useMemo(() => isPaidTierCheck(currentTier), [currentTier]);

  // Error handler for purchase-related errors
  const handlePurchaseError = (error: unknown) => {
    const purchaseError = error as PurchasesError;

    let title = t('subscription.errors.purchaseError');
    let message = t('subscription.errors.defaultMessage');

    switch (purchaseError.code) {
      case PURCHASES_ERROR_CODE.NETWORK_ERROR:
      case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
        title = t('subscription.errors.networkError');
        message = t('subscription.errors.networkMessage');
        break;
      case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
        title = t('subscription.errors.notAllowed');
        message = t('subscription.errors.notAllowedMessage');
        break;
      case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
        title = t('subscription.errors.paymentPending');
        message = t('subscription.errors.paymentPendingMessage');
        break;
      case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
        title = t('subscription.errors.alreadySubscribed');
        message = t('subscription.errors.alreadySubscribedMessage');
        break;
      case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
        title = t('subscription.errors.storeProblem');
        message = t('subscription.errors.storeProblemMessage');
        break;
      case PURCHASES_ERROR_CODE.CONFIGURATION_ERROR:
        title = t('subscription.errors.configurationError');
        message = t('subscription.errors.configurationErrorMessage');
        break;
    }

    if (!purchaseError.userCancelled) {
      Alert.alert(title, message, [{ text: t('common.ok'), style: 'default' }]);
    }
  };

  useEffect(() => {
    // Handle logout - reset tracking ref and logout from RevenueCat
    if (!user?.id) {
      const handleLogout = async () => {
        try {
          const isConfigured = await Purchases.isConfigured();
          if (isConfigured && lastUserIdRef.current) {
            try {
              await Purchases.logOut();
              logger.debug('RevenueCat: Logged out on user logout');
            } catch (error) {
              logger.warn('RevenueCat: Failed to logout', { error: String(error) });
            }
          }
        } catch (error) {
          logger.warn('RevenueCat: isConfigured() check failed on logout', { error: String(error) });
        }
        lastUserIdRef.current = null;
        setCustomerInfo(null);
        setIsInitialized(false);
        setIsLoading(false);
      };
      handleLogout().catch(error => {
        logger.warn('RevenueCat: handleLogout failed', { error: String(error) });
        lastUserIdRef.current = null;
        setCustomerInfo(null);
        setIsInitialized(false);
        setIsLoading(false);
      });
      return;
    }

    // Skip if already successfully initialized for this user
    if (user.id === lastUserIdRef.current) {
      return;
    }

    const initializeRevenueCat = async () => {
      try {
        const testStoreKey = process.env.EXPO_PUBLIC_REVENUECAT_TEST_STORE_KEY || '';
        const nativeKey =
          Platform.select({
            ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '',
            android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || '',
          }) || '';

        const apiKey = isExpoGo && testStoreKey ? testStoreKey : nativeKey;

        if (!apiKey) {
          logger.warn('RevenueCat API key not configured', {
            isExpoGo,
            hasTestKey: !!testStoreKey,
            hasNativeKey: !!nativeKey,
          });
          setIsLoading(false);
          return;
        }

        logger.info('RevenueCat configuring', {
          isExpoGo,
          keyType: isExpoGo && testStoreKey ? 'test_store' : 'native',
        });

        // Only configure if not already configured to prevent duplicate initialization warnings
        const isConfigured = await Purchases.isConfigured();
        if (!isConfigured) {
          await Purchases.configure({
            apiKey,
            appUserID: user.id,
          });
        } else {
          // SDK already configured - log in as new user (handles user switch)
          try {
            const { customerInfo: newInfo } = await Purchases.logIn(user.id);
            setCustomerInfo(newInfo);
          } catch (loginError) {
            logger.warn('RevenueCat: logIn failed, continuing with cached data', {
              error: String(loginError),
              userId: user.id,
            });
          }
        }

        if (__DEV__) {
          try {
            await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
          } catch {
            // Ignore - debug logging is non-critical
          }
        }

        listenerRef.current = (info: CustomerInfo) => {
          setCustomerInfo(info);
        };

        Purchases.addCustomerInfoUpdateListener(listenerRef.current);

        // Fetch customer info and offerings separately so one failure doesn't block the other
        try {
          const info = await Purchases.getCustomerInfo();
          setCustomerInfo(info);
        } catch (infoError) {
          logger.warn('RevenueCat: getCustomerInfo failed', { error: String(infoError) });
        }

        try {
          const availableOfferings = await Purchases.getOfferings();
          if (availableOfferings.current) {
            setOfferings(availableOfferings.current);
          } else {
            logger.warn('RevenueCat: No current offering found');
          }

          // Fetch credits offering for consumable purchases
          if (availableOfferings.all['credits']) {
            setCreditsOffering(availableOfferings.all['credits']);
          } else {
            logger.warn('RevenueCat: No credits offering found');
          }
        } catch (offeringsError) {
          logger.warn('RevenueCat: getOfferings failed', { error: String(offeringsError) });
        }

        // Mark as initialized even if offerings/customerInfo fetch failed —
        // the app works fine without them (free tier defaults).
        // This prevents infinite retry loops from the useEffect.
        lastUserIdRef.current = user.id;
        setIsInitialized(true);
      } catch (error) {
        logger.error('RevenueCat initialization error', error);
        // Don't show purchase error alert on init failure — the app works fine without
        // RevenueCat (free tier). Alerts should only appear on user-initiated purchases.
        // Don't set lastUserIdRef so effect can retry on next render
      } finally {
        setIsLoading(false);
      }
    };

    initializeRevenueCat();

    // Cleanup listener on unmount
    return () => {
      if (listenerRef.current) {
        Purchases.removeCustomerInfoUpdateListener(listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, [user?.id]);

  const handlePurchaseErrorRef = useRef(handlePurchaseError);
  handlePurchaseErrorRef.current = handlePurchaseError;

  const tRef = useRef(t);
  tRef.current = t;

  const refreshCustomerInfo = useCallback(async () => {
    try {
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);
    } catch (error) {
      // Only log — don't show alert for background refresh failures.
      // Alerts should only appear on explicit user-initiated purchase actions.
      logger.warn('Error refreshing customer info', { error: String(error) });
    }
  }, []);

  const purchasePackage = useCallback(async (pkg: PurchasesPackage): Promise<boolean> => {
    try {
      setIsLoading(true);

      const { customerInfo: info } = await Purchases.purchasePackage(pkg);
      setCustomerInfo(info);

      const hasStudio = info.entitlements.active[REVENUECAT_ENTITLEMENTS.STUDIO] !== undefined;
      const hasPractice = info.entitlements.active[REVENUECAT_ENTITLEMENTS.PRACTICE] !== undefined;
      const hasPersonal = info.entitlements.active[REVENUECAT_ENTITLEMENTS.PERSONAL] !== undefined;
      const isPaidNow = hasStudio || hasPractice || hasPersonal;

      if (isPaidNow) {
        const tier = hasStudio ? TIER_IDS.STUDIO : hasPractice ? TIER_IDS.PRACTICE : TIER_IDS.PERSONAL;
        const productId = pkg.product.identifier;
        const entitlementId = hasStudio
          ? REVENUECAT_ENTITLEMENTS.STUDIO
          : hasPractice
            ? REVENUECAT_ENTITLEMENTS.PRACTICE
            : REVENUECAT_ENTITLEMENTS.PERSONAL;

        logger.info('Syncing subscription to backend...', { tier, productId, entitlementId });

        try {
          const syncResult = await apiRequest('/api/v1/app/subscriptions/sync', {
            method: 'POST',
            data: {
              tier,
              productId,
              entitlementId,
            },
          });
          logger.info('Subscription synced to backend successfully', { tier, productId, syncResult });
        } catch (syncError: unknown) {
          const syncErr = syncError as { message?: string; response?: { data?: { message?: string } } };
          const errorMessage = syncErr?.message || syncErr?.response?.data?.message || String(syncError);
          logger.error('Failed to sync subscription to backend', {
            error: errorMessage,
            tier,
            productId,
          });
          if (__DEV__) {
            Alert.alert('Sync Debug', `Sync failed: ${errorMessage}`);
          }
        }

        return true;
      }

      return false;
    } catch (error: unknown) {
      const purchaseError = error as { userCancelled?: boolean };
      if (purchaseError.userCancelled) {
        return false;
      }
      logger.error('Purchase error', error);
      handlePurchaseErrorRef.current(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const purchaseCredits = useCallback(
    async (product: PurchasesStoreProduct): Promise<{ success: boolean; creditsGranted?: number }> => {
      if (Platform.OS === 'web') {
        Alert.alert(tRef.current('creditStore.webNotSupported'), tRef.current('creditStore.useNativeApp'), [
          { text: tRef.current('common.ok'), style: 'default' },
        ]);
        return { success: false };
      }

      try {
        setIsLoading(true);

        const { customerInfo: info, transaction } = await Purchases.purchaseStoreProduct(product);
        setCustomerInfo(info);

        const transactionId = transaction?.transactionIdentifier || '';

        if (!transactionId) {
          logger.error('No transaction ID received from RevenueCat purchase');
          Alert.alert(tRef.current('creditStore.purchaseError'), tRef.current('creditStore.noTransactionId'), [
            { text: tRef.current('common.ok'), style: 'default' },
          ]);
          return { success: false };
        }

        const response = await apiClient.post<ServiceResponse<{ creditsGranted: number }>>(
          '/api/v1/app/credits/grant-revenuecat',
          { productId: product.identifier, transactionId }
        );

        if (response.success && response.data) {
          return { success: true, creditsGranted: response.data.creditsGranted };
        } else {
          logger.error('Failed to grant credits after purchase', response);
          Alert.alert(tRef.current('creditStore.purchaseError'), tRef.current('creditStore.creditGrantFailed'), [
            { text: tRef.current('common.ok'), style: 'default' },
          ]);
          return { success: false };
        }
      } catch (error: unknown) {
        const purchaseError = error as { userCancelled?: boolean };
        if (purchaseError.userCancelled) {
          return { success: false };
        }
        logger.error('Credits purchase error', error);
        handlePurchaseErrorRef.current(error);
        return { success: false };
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true);

      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);

      const hasStudio = info.entitlements.active[REVENUECAT_ENTITLEMENTS.STUDIO] !== undefined;
      const hasPractice = info.entitlements.active[REVENUECAT_ENTITLEMENTS.PRACTICE] !== undefined;
      const hasPersonal = info.entitlements.active[REVENUECAT_ENTITLEMENTS.PERSONAL] !== undefined;
      const isPaidNow = hasStudio || hasPractice || hasPersonal;

      if (isPaidNow) {
        return true;
      } else {
        Alert.alert(
          tRef.current('subscription.alerts.noPurchasesTitle'),
          tRef.current('subscription.alerts.noPurchasesMessage'),
          [{ text: tRef.current('subscription.alerts.ok'), style: 'default' }]
        );
        return false;
      }
    } catch (error) {
      logger.error('Restore purchases error', error);
      handlePurchaseErrorRef.current(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const showPaywall = useCallback(() => {}, []);

  const showCustomerCenter = useCallback(async () => {
    const { presentCustomerCenter } = await import('../components/commerce/CustomerCenter');
    await presentCustomerCenter();
  }, []);

  const dataValue = useMemo<SubscriptionDataValue>(
    () => ({
      isInitialized,
      customerInfo,
      offerings,
      creditsOffering,
      isLoading,
      isPaidTier,
      currentTier,
      currentBillingPeriod,
      tierConfig,
      canGenerateMusic,
      generationLimit,
      subscriptionConfig,
    }),
    [
      isInitialized,
      customerInfo,
      offerings,
      creditsOffering,
      isLoading,
      isPaidTier,
      currentTier,
      currentBillingPeriod,
      tierConfig,
      canGenerateMusic,
      generationLimit,
      subscriptionConfig,
    ]
  );

  const actionsValue = useMemo<SubscriptionActionsValue>(
    () => ({
      refreshCustomerInfo,
      purchasePackage,
      purchaseCredits,
      restorePurchases,
      showPaywall,
      showCustomerCenter,
    }),
    [refreshCustomerInfo, purchasePackage, purchaseCredits, restorePurchases, showPaywall, showCustomerCenter]
  );

  return (
    <SubscriptionDataContext.Provider value={dataValue}>
      <SubscriptionActionsContext.Provider value={actionsValue}>{children}</SubscriptionActionsContext.Provider>
    </SubscriptionDataContext.Provider>
  );
}

export function useSubscriptionData() {
  const context = useContext(SubscriptionDataContext);
  if (!context) {
    throw new Error('useSubscriptionData must be used within SubscriptionProvider');
  }
  return context;
}

export function useSubscriptionActions() {
  const context = useContext(SubscriptionActionsContext);
  if (!context) {
    throw new Error('useSubscriptionActions must be used within SubscriptionProvider');
  }
  return context;
}
