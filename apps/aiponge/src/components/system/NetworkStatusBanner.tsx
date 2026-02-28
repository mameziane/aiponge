/**
 * Network Status Banner
 * Shows non-intrusive indicator when connection is slow or backend is unavailable.
 * Shows a brief "Back online" message when connectivity is restored, then auto-hides.
 */

import { useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { useNetworkStatus } from '../../hooks/system/useNetworkStatus';
import { useThemeColors, type ColorScheme } from '../../theme';

const RECONNECT_BANNER_DURATION = 3000;

interface NetworkStatusBannerProps {
  backendUnavailable?: boolean;
}

export function NetworkStatusBanner({ backendUnavailable }: NetworkStatusBannerProps) {
  const { t } = useTranslation();
  const { isConnected, isOffline } = useNetworkStatus();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOffline = useRef(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isOffline) {
      wasOffline.current = true;
      setShowReconnected(false);
      fadeAnim.setValue(1);
    } else if (wasOffline.current && isConnected) {
      wasOffline.current = false;
      setShowReconnected(true);
      fadeAnim.setValue(1);

      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }).start(() => setShowReconnected(false));
      }, RECONNECT_BANNER_DURATION);

      return () => clearTimeout(timer);
    }
  }, [isOffline, isConnected, fadeAnim]);

  if (showReconnected) {
    const successColor = colors.semantic.success;
    return (
      <Animated.View style={[styles.banner, { backgroundColor: `${successColor}20`, opacity: fadeAnim }]}>
        <Ionicons name="cloud-done" size={16} color={successColor} style={styles.icon} />
        <Text style={[styles.text, { color: successColor }]}>
          {t('components.networkStatus.backOnline', 'Back online')}
        </Text>
      </Animated.View>
    );
  }

  if (!isOffline && !backendUnavailable) {
    return null;
  }

  let message: string;
  let iconName: 'cloud-offline' | 'server-outline';
  let bgColor: string;

  if (!isConnected || isOffline) {
    message = t('components.networkStatus.noConnection', 'No internet connection');
    iconName = 'cloud-offline';
    bgColor = colors.semantic.error;
  } else if (backendUnavailable) {
    message = t('errors.serviceUnavailable', 'Service temporarily unavailable. Please try again shortly.');
    iconName = 'server-outline';
    bgColor = colors.semantic.warning;
  } else {
    message = t('components.networkStatus.noConnection', 'No internet connection');
    iconName = 'cloud-offline';
    bgColor = colors.semantic.warning;
  }

  return (
    <View style={[styles.banner, { backgroundColor: `${bgColor}20` }]}>
      <Ionicons name={iconName} size={16} color={bgColor} style={styles.icon} />
      <Text style={[styles.text, { color: bgColor }]}>{message}</Text>
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      marginHorizontal: 16,
      marginBottom: 12,
    },
    icon: {
      marginRight: 8,
    },
    text: {
      fontSize: 13,
      fontWeight: '500',
    },
  });
