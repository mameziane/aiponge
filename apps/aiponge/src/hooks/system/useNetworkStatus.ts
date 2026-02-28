/**
 * ✅ PERFORMANCE: Network status hook (SINGLETON PATTERN)
 * Detects network connectivity and speed for better UX on slow connections
 *
 * OPTIMIZATION: Uses module-level singleton to prevent duplicate NetInfo subscriptions.
 * Multiple components using this hook share the same subscription and state.
 */

import { useSyncExternalStore } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { logger } from '../../lib/logger';

export type NetworkQuality = 'fast' | 'slow' | 'offline';

export interface NetworkStatus {
  isConnected: boolean;
  quality: NetworkQuality;
  type: string | null;
  effectiveType: string | null;
  isOffline: boolean;
}

const determineQuality = (isConnected: boolean, type: string, effectiveType: string | null): NetworkQuality => {
  if (!isConnected) return 'offline';
  if (type === 'cellular') {
    if (effectiveType === '2g' || effectiveType === '3g') return 'slow';
    return 'fast';
  }
  if (type === 'wifi') return 'fast';
  if (type === 'unknown' || type === 'none') return 'offline';
  return 'fast';
};

// =========== MODULE-LEVEL SINGLETON ===========
// Single source of truth for network status across all hook instances
let globalNetworkStatus: NetworkStatus = {
  isConnected: true,
  quality: 'fast',
  type: null,
  effectiveType: null,
  isOffline: false,
};
let globalSubscribed = false;
let globalUnsubscribe: (() => void) | null = null;
let globalLastStatusKey = '';
const listeners = new Set<() => void>();

function notifyListeners() {
  listeners.forEach(listener => listener());
}

function processNetworkState(state: NetInfoState, isInitial = false) {
  const isConnected = state.isConnected ?? false;
  const type = state.type;
  const effectiveType =
    state.details && 'cellularGeneration' in state.details ? (state.details.cellularGeneration as string | null) : null;

  const quality = determineQuality(isConnected, type, effectiveType);
  const statusKey = `${isConnected}-${quality}-${type}-${effectiveType}`;

  // Deduplicate - only update and log if status actually changed
  if (statusKey === globalLastStatusKey) {
    return;
  }
  globalLastStatusKey = statusKey;

  if (!isInitial) {
    logger.debug('Network status changed', {
      isConnected,
      quality,
      type,
      effectiveType,
    });
  }

  const isOffline = quality === 'offline';

  globalNetworkStatus = {
    isConnected,
    quality,
    type,
    effectiveType,
    isOffline,
  };

  notifyListeners();
}

function initializeNetworkSubscription() {
  if (globalSubscribed) return;
  globalSubscribed = true;

  // Get initial state
  NetInfo.fetch().then((state: NetInfoState) => {
    processNetworkState(state, true);
  });

  // Subscribe to changes (only once globally)
  globalUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    processNetworkState(state, false);
  });
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  initializeNetworkSubscription();

  return () => {
    listeners.delete(callback);
    // Note: We don't unsubscribe from NetInfo even if no listeners
    // because re-subscribing is expensive. The subscription is lightweight.
  };
}

function getSnapshot() {
  return globalNetworkStatus;
}

/**
 * Hook to detect network status and quality
 * Returns connection status and quality (fast/slow/offline)
 *
 * Uses useSyncExternalStore for efficient singleton pattern.
 * All components share the same NetInfo subscription.
 */
export function useNetworkStatus(): NetworkStatus {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
