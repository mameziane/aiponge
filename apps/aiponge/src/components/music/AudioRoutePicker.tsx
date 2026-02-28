/**
 * AudioRoutePicker Component
 *
 * Provides Spotify-like audio output device selection:
 * - iOS: Native AirPlay route picker (AVRoutePickerView) via react-airplay
 * - Android: Chromecast via react-native-google-cast + Bluetooth devices
 * - Both: Unified device picker with all available audio outputs
 *
 * Requires production/development build - will show fallback in Expo Go
 */

import React, { useCallback, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Modal, FlatList, Alert, SectionList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';
import { useTranslation } from '../../i18n';
import { useAudioOutput } from '../../hooks/music/useAudioOutput';
import { useChromecast } from '../../hooks/music/useChromecast';
import { useCastPlayback } from '../../hooks/music/useCastPlayback';
import { logger } from '../../lib/logger';
import type { IconName } from '../../types/ui.types';

const isExpoGo = Constants.appOwnership === 'expo';

let AirplayButton: React.ComponentType<Record<string, unknown>> | null = null;
let showRoutePicker: ((options?: { prioritizesVideoDevices?: boolean }) => void) | null = null;
let useAirplayConnectivity: (() => boolean) | null = null;
let useExternalPlaybackAvailability: (() => boolean) | null = null;
let useAvAudioSessionRoutes: (() => Array<{ portName: string; portType: string; uid: string }>) | null = null;

if (!isExpoGo && Platform.OS === 'ios') {
  try {
    const reactAirplay = require('react-airplay');
    AirplayButton = reactAirplay.AirplayButton;
    showRoutePicker = reactAirplay.showRoutePicker;
    useAirplayConnectivity = reactAirplay.useAirplayConnectivity;
    useExternalPlaybackAvailability = reactAirplay.useExternalPlaybackAvailability;
    useAvAudioSessionRoutes = reactAirplay.useAvAudioSessionRoutes;
    logger.info('[AudioRoutePicker] react-airplay loaded successfully');
  } catch (error) {
    logger.warn('[AudioRoutePicker] Failed to load react-airplay', { error });
  }
}

interface AudioRoutePickerProps {
  size?: number;
  color?: string;
  activeColor?: string;
  showLabel?: boolean;
  style?: Record<string, unknown>;
}

interface UnifiedDevice {
  id: string;
  name: string;
  type: 'bluetooth' | 'chromecast' | 'wired' | 'speaker' | 'airplay';
  icon: IconName;
  source: 'audio' | 'cast';
}

export function AudioRoutePicker({
  size = 24,
  color: colorProp,
  activeColor: activeColorProp,
  showLabel = false,
  style,
}: AudioRoutePickerProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const color = colorProp ?? colors.text.secondary;
  const activeColor = activeColorProp ?? colors.brand.primary;
  const { t } = useTranslation();
  const { outputInfo, allDevices, selectDevice, supportsOutputDiscovery, isRunningInExpoGo } = useAudioOutput();
  const {
    isConnected: isCastConnected,
    device: castDevice,
    devices: castDevices,
    isSupported: isCastSupported,
    CastButton,
  } = useChromecast();
  const { startCasting, stopCasting, isCasting } = useCastPlayback();
  const [showDevicePicker, setShowDevicePicker] = useState(false);

  const isAirplayConnected = useAirplayConnectivity?.() ?? false;
  const isExternalAvailable = useExternalPlaybackAvailability?.() ?? false;
  const audioRoutes = useAvAudioSessionRoutes?.() ?? [];

  const isExternalActive = outputInfo.deviceType === 'bluetooth' || isAirplayConnected || isCastConnected;
  const currentColor = isExternalActive ? activeColor : color;

  const getDeviceIcon = (type: string): IconName => {
    const typeLower = type.toLowerCase();
    if (typeLower.includes('chromecast') || typeLower.includes('cast')) return 'tv-outline';
    if (typeLower.includes('bluetooth') || typeLower.includes('a2dp')) return 'bluetooth';
    if (typeLower.includes('wired') || typeLower.includes('headphone')) return 'headset';
    if (typeLower.includes('usb')) return 'hardware-chip-outline';
    if (typeLower.includes('airplay') || typeLower.includes('airpods')) return 'radio-outline';
    return 'volume-high';
  };

  const getCurrentDeviceName = (): string => {
    if (isCastConnected && castDevice) {
      return castDevice.deviceName;
    }
    if (audioRoutes.length > 0) {
      return audioRoutes[0].portName;
    }
    return outputInfo.deviceName;
  };

  const handleIOSPress = useCallback(() => {
    if (showRoutePicker) {
      showRoutePicker({ prioritizesVideoDevices: false });
    } else {
      Alert.alert(t('audioOutput.unavailable'), t('audioOutput.requiresProductionBuild'));
    }
  }, [t]);

  const handleAndroidPress = useCallback(() => {
    setShowDevicePicker(true);
  }, []);

  const handleSelectAudioDevice = useCallback(
    async (deviceId: string) => {
      const success = await selectDevice(deviceId);
      if (success) {
        setShowDevicePicker(false);
      } else {
        Alert.alert(t('audioOutput.switchFailed'), t('audioOutput.switchFailedDescription'));
      }
    },
    [selectDevice, t]
  );

  const handleSelectCastDevice = useCallback(async () => {
    setShowDevicePicker(false);
    const success = await startCasting();
    if (!success) {
      Alert.alert(t('audioOutput.castUnavailable'), t('audioOutput.castUnavailableDescription'));
    }
  }, [startCasting, t]);

  const handleStopCasting = useCallback(async () => {
    await stopCasting();
    setShowDevicePicker(false);
  }, [stopCasting]);

  const bluetoothDevices: UnifiedDevice[] = allDevices.map(device => ({
    id: device.id,
    name: device.name || t('audioOutput.unknownDevice'),
    type: 'bluetooth' as const,
    icon: getDeviceIcon(device.type || ''),
    source: 'audio' as const,
  }));

  const chromecastDevices: UnifiedDevice[] = castDevices.map(device => ({
    id: device.deviceId,
    name: device.deviceName,
    type: 'chromecast' as const,
    icon: 'tv-outline' as IconName,
    source: 'cast' as const,
  }));

  const sections = [
    ...(chromecastDevices.length > 0 || isCastSupported
      ? [
          {
            title: t('audioOutput.chromecast'),
            data:
              chromecastDevices.length > 0
                ? chromecastDevices
                : [
                    {
                      id: 'cast-discover',
                      name: t('audioOutput.searchCastDevices'),
                      type: 'chromecast' as const,
                      icon: 'search-outline' as IconName,
                      source: 'cast' as const,
                    },
                  ],
          },
        ]
      : []),
    ...(bluetoothDevices.length > 0
      ? [
          {
            title: t('audioOutput.bluetooth'),
            data: bluetoothDevices,
          },
        ]
      : []),
  ];

  const renderDevice = ({ item }: { item: UnifiedDevice }) => {
    const isActive =
      item.source === 'cast'
        ? isCastConnected && castDevice && castDevice.deviceId === item.id
        : outputInfo.deviceName === item.name;

    const handlePress = () => {
      if (item.source === 'cast' || item.id === 'cast-discover') {
        handleSelectCastDevice();
      } else {
        handleSelectAudioDevice(item.id);
      }
    };

    return (
      <TouchableOpacity style={styles.deviceItem} onPress={handlePress} testID={`audio-device-${item.id}`}>
        <Ionicons name={item.icon} size={24} color={colors.brand.primary} />
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.name}</Text>
          {item.type === 'chromecast' && item.id !== 'cast-discover' && (
            <Text style={styles.deviceType}>{t('audioOutput.chromecast')}</Text>
          )}
        </View>
        {isActive && <Ionicons name="checkmark-circle" size={20} color={colors.brand.primary} />}
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section }: { section: { title: string } }) => (
    <Text style={styles.sectionHeader}>{section.title}</Text>
  );

  if (isRunningInExpoGo) {
    return (
      <View style={[styles.container, style]}>
        <TouchableOpacity
          onPress={() => Alert.alert(t('audioOutput.expoGoLimitation'), t('audioOutput.requiresDevelopmentBuild'))}
          testID="audio-route-picker-stub"
        >
          <Ionicons name="volume-high" size={size} color={color} />
          {showLabel && <Text style={[styles.label, { color }]}>{t('audioOutput.speaker')}</Text>}
        </TouchableOpacity>
      </View>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <View style={[styles.container, style]}>
        {AirplayButton ? (
          <AirplayButton
            prioritizesVideoDevices={false}
            tintColor={currentColor}
            activeTintColor={activeColor}
            style={{ width: size, height: size }}
            testID="audio-route-picker-ios"
          />
        ) : (
          <TouchableOpacity onPress={handleIOSPress} testID="audio-route-picker-ios-fallback">
            <Ionicons name={outputInfo.icon} size={size} color={currentColor} />
          </TouchableOpacity>
        )}
        {showLabel && (
          <Text style={[styles.label, { color: currentColor }]} numberOfLines={1}>
            {getCurrentDeviceName()}
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity onPress={handleAndroidPress} testID="audio-route-picker-android">
        <Ionicons name={isCastConnected ? 'tv-outline' : outputInfo.icon} size={size} color={currentColor} />
      </TouchableOpacity>
      {showLabel && (
        <Text style={[styles.label, { color: currentColor }]} numberOfLines={1}>
          {getCurrentDeviceName()}
        </Text>
      )}

      <Modal
        visible={showDevicePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDevicePicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('audioOutput.selectDevice')}</Text>
              <TouchableOpacity onPress={() => setShowDevicePicker(false)} testID="close-audio-picker">
                <Ionicons name="close" size={24} color={colors.text.primary} />
              </TouchableOpacity>
            </View>

            {isCastSupported && CastButton != null && (
              <View style={styles.castButtonContainer}>
                {isCasting || isCastConnected ? (
                  <View style={styles.castActiveSection}>
                    <View style={styles.castActiveInfo}>
                      <Ionicons name="tv" size={24} color={colors.brand.primary} />
                      <View style={styles.castActiveText}>
                        <Text style={styles.castButtonText}>{t('audioOutput.castingTo')}</Text>
                        <Text style={styles.connectedLabel}>
                          {castDevice?.deviceName || t('audioOutput.chromecastDevice')}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.stopCastButton}
                      onPress={handleStopCasting}
                      testID="stop-cast-button"
                    >
                      <Text style={styles.stopCastText}>{t('audioOutput.stopCasting')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.castButton}
                    onPress={handleSelectCastDevice}
                    testID="cast-button-android"
                  >
                    <Ionicons name="tv-outline" size={24} color={colors.brand.primary} />
                    <Text style={styles.castButtonText}>{t('audioOutput.castToDevice')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {sections.length === 0 && !isCastSupported ? (
              <View style={styles.emptyState}>
                <Ionicons name="bluetooth-outline" size={48} color={colors.text.tertiary} />
                <Text style={styles.emptyText}>{t('audioOutput.noDevices')}</Text>
                <Text style={styles.emptySubtext}>{t('audioOutput.connectBluetoothDevice')}</Text>
              </View>
            ) : (
              <SectionList
                sections={sections}
                renderItem={renderDevice}
                renderSectionHeader={renderSectionHeader}
                keyExtractor={item => item.id}
                showsVerticalScrollIndicator={false}
                stickySectionHeadersEnabled={false}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function AudioRoutePickerCompact({ style }: { style?: Record<string, unknown> }) {
  return <AudioRoutePicker size={20} showLabel={false} style={style} />;
}

export function AudioRoutePickerButton({ style }: { style?: Record<string, unknown> }) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.buttonContainer, style]}>
      <AudioRoutePicker size={24} showLabel={true} />
    </View>
  );
}

export function CastButtonOnly({ size = 24, color: colorProp }: { size?: number; color?: string }) {
  const colors = useThemeColors();
  const color = colorProp ?? colors.text.secondary;
  const { CastButton, isSupported, showCastDialog } = useChromecast();
  const { t } = useTranslation();

  if (!isSupported) {
    return null;
  }

  if (CastButton) {
    return <CastButton style={{ width: size, height: size, tintColor: color }} />;
  }

  return (
    <TouchableOpacity onPress={showCastDialog} testID="cast-button-fallback">
      <Ionicons name="tv-outline" size={size} color={color} />
    </TouchableOpacity>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    buttonContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      gap: 8,
    },
    label: {
      fontSize: 12,
      fontWeight: '500',
      maxWidth: 100,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.background.primary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      maxHeight: '70%',
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.primary,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    sectionHeader: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text.secondary,
      marginTop: 16,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    castButtonContainer: {
      marginBottom: 16,
    },
    castButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background.secondary,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      gap: 12,
      borderWidth: 1,
      borderColor: colors.brand.primary,
    },
    castButtonText: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.text.primary,
    },
    connectedLabel: {
      fontSize: 12,
      color: colors.brand.primary,
      fontWeight: '500',
    },
    castActiveSection: {
      backgroundColor: colors.background.secondary,
      padding: 16,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.brand.primary,
      gap: 12,
    },
    castActiveInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    castActiveText: {
      flex: 1,
    },
    stopCastButton: {
      backgroundColor: colors.semantic.error,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: BORDER_RADIUS.sm,
      alignItems: 'center',
    },
    stopCastText: {
      color: colors.text.primary,
      fontWeight: '600',
      fontSize: 14,
    },
    deviceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 12,
      backgroundColor: colors.background.secondary,
      borderRadius: BORDER_RADIUS.md,
      marginBottom: 8,
      gap: 12,
    },
    deviceInfo: {
      flex: 1,
    },
    deviceName: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.primary,
    },
    deviceType: {
      fontSize: 12,
      color: colors.text.tertiary,
      marginTop: 2,
      textTransform: 'capitalize',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 40,
      gap: 12,
    },
    emptyText: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text.secondary,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.text.tertiary,
      textAlign: 'center',
    },
  });
