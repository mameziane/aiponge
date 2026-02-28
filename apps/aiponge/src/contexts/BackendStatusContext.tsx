/**
 * Backend Status Context
 * Global state for tracking backend/API Gateway availability
 * Shows user-friendly overlay when backend is unavailable
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../i18n';
import { useThemeColors, type ColorScheme } from '../theme';
import { BORDER_RADIUS } from '../theme/constants';
import { checkIsBackendUnavailable } from '../utils/errorSerialization';
import { apiClient } from '../lib/axiosApiClient';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'degraded';
  responseTime?: number;
}

interface BackendStatusContextType {
  isBackendUnavailable: boolean;
  unhealthyServices: ServiceHealth[];
  reportError: (error: unknown) => void;
  clearError: () => void;
  retryConnection: () => Promise<void>;
}

const BackendStatusContext = createContext<BackendStatusContextType | null>(null);

const COOLDOWN_PERIOD = 5000; // 5 seconds between showing the modal again
const AUTO_RETRY_INTERVAL = 30000; // Auto-retry every 30 seconds
const STARTUP_HEALTH_CHECK_TIMEOUT = 10000; // 10 second timeout for startup check

interface BackendStatusProviderProps {
  children: React.ReactNode;
  onRetry?: () => Promise<boolean>;
}

export function BackendStatusProvider({ children, onRetry }: BackendStatusProviderProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [isBackendUnavailable, setIsBackendUnavailable] = useState(false);
  const [unhealthyServices, setUnhealthyServices] = useState<ServiceHealth[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const lastErrorTime = useRef<number>(0);
  const consecutiveErrors = useRef<number>(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reportError = useCallback((error: unknown) => {
    if (checkIsBackendUnavailable(error)) {
      const now = Date.now();
      consecutiveErrors.current += 1;

      if (consecutiveErrors.current >= 1) {
        setIsBackendUnavailable(true);
      }

      lastErrorTime.current = now;
    }
  }, []);

  useEffect(() => {
    apiClient.setBackendErrorReporter(reportError);
    return () => {
      apiClient.setBackendErrorReporter(() => {});
    };
  }, [reportError]);

  useEffect(() => {
    const performStartupHealthCheck = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), STARTUP_HEALTH_CHECK_TIMEOUT);

        const response = await apiClient.get<{ services: ServiceHealth[] }>('/health/services', {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const services = response?.services || [];
        const unhealthy = services.filter((s: ServiceHealth) => s.status === 'unhealthy');

        if (unhealthy.length > 0) {
          setUnhealthyServices(unhealthy);
          setIsBackendUnavailable(true);
          consecutiveErrors.current = 2;
        }
      } catch (error) {
        if (checkIsBackendUnavailable(error)) {
          setIsBackendUnavailable(true);
          consecutiveErrors.current = 2;
        }
      }
    };

    const startupDelay = setTimeout(performStartupHealthCheck, 500);

    return () => clearTimeout(startupDelay);
  }, []);

  const clearError = useCallback(() => {
    setIsBackendUnavailable(false);
    setUnhealthyServices([]);
    consecutiveErrors.current = 0;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const retryConnection = useCallback(async () => {
    setIsRetrying(true);
    try {
      if (onRetry) {
        const success = await onRetry();
        if (success) {
          clearError();
        }
      } else {
        const response = await apiClient.get<{ services: ServiceHealth[] }>('/health/services');
        const services = response?.services || [];
        const unhealthy = services.filter((s: ServiceHealth) => s.status === 'unhealthy');

        if (unhealthy.length === 0) {
          clearError();
        } else {
          setUnhealthyServices(unhealthy);
        }
      }
    } catch {
      // Still unavailable
    } finally {
      setIsRetrying(false);
    }
  }, [onRetry, clearError]);

  useEffect(() => {
    if (isBackendUnavailable && !isRetrying) {
      retryTimeoutRef.current = setTimeout(() => {
        retryConnection();
      }, AUTO_RETRY_INTERVAL);

      return () => {
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
      };
    }
  }, [isBackendUnavailable, isRetrying, retryConnection]);

  return (
    <BackendStatusContext.Provider
      value={{ isBackendUnavailable, unhealthyServices, reportError, clearError, retryConnection }}
    >
      {children}

      <Modal visible={isBackendUnavailable} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={styles.container}>
            <View style={styles.iconContainer}>
              <Ionicons name="cloud-offline-outline" size={64} color={colors.brand.primary} />
            </View>

            <Text style={styles.title}>{t('errors.serviceUnavailableTitle', 'Service Temporarily Unavailable')}</Text>

            <Text style={styles.message}>
              {unhealthyServices.length > 0
                ? t(
                    'errors.servicesUnavailableMessage',
                    'Some of our services are currently unavailable. We are working to restore them.'
                  )
                : t(
                    'errors.serviceUnavailableMessage',
                    "We're having trouble connecting to our servers. This is usually temporary. Please try again in a moment."
                  )}
            </Text>

            {unhealthyServices.length > 0 && (
              <View style={styles.servicesList}>
                {unhealthyServices.slice(0, 3).map(service => (
                  <View key={service.name} style={styles.serviceItem}>
                    <Ionicons name="alert-circle" size={16} color={colors.status.needsAttention} />
                    <Text style={styles.serviceText}>{service.name.replace('-service', '')}</Text>
                  </View>
                ))}
                {unhealthyServices.length > 3 && (
                  <Text style={styles.moreServicesText}>
                    {t('errors.moreServicesDown', '+{{count}} more', { count: unhealthyServices.length - 3 })}
                  </Text>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.retryButton, isRetrying && styles.retryButtonDisabled]}
              onPress={retryConnection}
              disabled={isRetrying}
              activeOpacity={0.7}
            >
              {isRetrying ? (
                <ActivityIndicator size="small" color={colors.background.dark} />
              ) : (
                <>
                  <Ionicons name="refresh" size={20} color={colors.background.dark} />
                  <Text style={styles.retryButtonText}>{t('common.tryAgain', 'Try Again')}</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.autoRetryText}>
              {t('errors.autoRetryMessage', "We'll automatically retry in 30 seconds")}
            </Text>
          </View>
        </View>
      </Modal>
    </BackendStatusContext.Provider>
  );
}

export function useBackendStatus() {
  const context = useContext(BackendStatusContext);
  if (!context) {
    throw new Error('useBackendStatus must be used within a BackendStatusProvider');
  }
  return context;
}

export function useBackendStatusOptional() {
  return useContext(BackendStatusContext);
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay.black[85],
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    } as ViewStyle,
    container: {
      backgroundColor: colors.background.surfaceLight,
      borderRadius: 20,
      padding: 32,
      alignItems: 'center',
      maxWidth: 340,
      width: '100%',
    } as ViewStyle,
    iconContainer: {
      marginBottom: 20,
      padding: 16,
      borderRadius: 50,
      backgroundColor: colors.brand.primary + '15',
    } as ViewStyle,
    title: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text.dark,
      textAlign: 'center',
      marginBottom: 12,
    } as TextStyle,
    message: {
      fontSize: 15,
      color: colors.text.muted,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 24,
    } as TextStyle,
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brand.primary,
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: BORDER_RADIUS.md,
      gap: 8,
      minWidth: 140,
    } as ViewStyle,
    retryButtonDisabled: {
      opacity: 0.7,
    } as ViewStyle,
    retryButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.background.dark,
    } as TextStyle,
    autoRetryText: {
      fontSize: 13,
      color: colors.text.tertiary,
      marginTop: 16,
      textAlign: 'center',
    } as TextStyle,
    servicesList: {
      marginBottom: 16,
      width: '100%',
      gap: 8,
    } as ViewStyle,
    serviceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: colors.status.needsAttention + '15',
      borderRadius: BORDER_RADIUS.sm,
    } as ViewStyle,
    serviceText: {
      fontSize: 14,
      color: colors.text.dark,
      textTransform: 'capitalize',
    } as TextStyle,
    moreServicesText: {
      fontSize: 12,
      color: colors.text.muted,
      textAlign: 'center',
      marginTop: 4,
    } as TextStyle,
  });
