import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../../lib/logger';

type LocationModule = {
  requestForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: (options: {
    accuracy: number;
  }) => Promise<{ coords: { latitude: number; longitude: number } }>;
  reverseGeocodeAsync: (coords: {
    latitude: number;
    longitude: number;
  }) => Promise<Array<{ city?: string; subregion?: string; country?: string; timezone?: string }>>;
  Accuracy: { Low: number };
};

let Location: LocationModule | null = null;
try {
  Location = require('expo-location') as LocationModule;
} catch {
  logger.warn('[useLocation] expo-location not available');
}

const LOCATION_CONSENT_KEY = '@aiponge/location_consent';
const LOCATION_CACHE_KEY = '@aiponge/location_cache';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

export interface LocationContext {
  city?: string;
  country?: string;
  timezone?: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  isGranted: boolean;
  isLoading: boolean;
}

interface CachedLocation {
  city?: string;
  country?: string;
  timezone?: string;
  timestamp: number;
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export function useLocation() {
  const [locationContext, setLocationContext] = useState<LocationContext>({
    timeOfDay: getTimeOfDay(),
    isGranted: false,
    isLoading: true,
  });
  const [hasAskedConsent, setHasAskedConsent] = useState(false);

  useEffect(() => {
    checkLocationConsent();
  }, []);

  const checkLocationConsent = async () => {
    try {
      const consent = await AsyncStorage.getItem(LOCATION_CONSENT_KEY);
      if (consent === 'granted') {
        setHasAskedConsent(true);
        await fetchLocation();
      } else if (consent === 'denied') {
        setHasAskedConsent(true);
        setLocationContext(prev => ({ ...prev, isLoading: false, isGranted: false }));
      } else {
        setLocationContext(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      logger.error('[useLocation] Failed to check consent', { error });
      setLocationContext(prev => ({ ...prev, isLoading: false }));
    }
  };

  const requestLocationPermission = useCallback(async (): Promise<boolean> => {
    if (!Location) {
      logger.warn('[useLocation] Location module not available');
      setLocationContext(prev => ({ ...prev, isLoading: false }));
      return false;
    }
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const granted = status === 'granted';

      await AsyncStorage.setItem(LOCATION_CONSENT_KEY, granted ? 'granted' : 'denied');
      setHasAskedConsent(true);

      if (granted) {
        await fetchLocation();
      } else {
        setLocationContext(prev => ({ ...prev, isGranted: false, isLoading: false }));
      }

      return granted;
    } catch (error) {
      logger.error('[useLocation] Failed to request permission', { error });
      setLocationContext(prev => ({ ...prev, isLoading: false }));
      return false;
    }
  }, []);

  const fetchLocation = async () => {
    if (!Location) {
      setLocationContext(prev => ({ ...prev, isLoading: false }));
      return;
    }
    try {
      setLocationContext(prev => ({ ...prev, isLoading: true }));

      const cachedData = await AsyncStorage.getItem(LOCATION_CACHE_KEY);
      if (cachedData) {
        const cached: CachedLocation = JSON.parse(cachedData);
        if (Date.now() - cached.timestamp < CACHE_DURATION_MS) {
          setLocationContext({
            city: cached.city,
            country: cached.country,
            timezone: cached.timezone,
            timeOfDay: getTimeOfDay(),
            isGranted: true,
            isLoading: false,
          });
          return;
        }
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Low,
      });

      const [address] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      const locationData: CachedLocation = {
        city: address?.city || address?.subregion || undefined,
        country: address?.country || undefined,
        timezone: address?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: Date.now(),
      };

      await AsyncStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(locationData));

      setLocationContext({
        city: locationData.city,
        country: locationData.country,
        timezone: locationData.timezone,
        timeOfDay: getTimeOfDay(),
        isGranted: true,
        isLoading: false,
      });

      logger.debug('[useLocation] Location fetched', { city: locationData.city });
    } catch (error) {
      logger.error('[useLocation] Failed to get location', { error });
      setLocationContext(prev => ({
        ...prev,
        timeOfDay: getTimeOfDay(),
        isLoading: false,
      }));
    }
  };

  const revokeLocationConsent = useCallback(async () => {
    try {
      await AsyncStorage.setItem(LOCATION_CONSENT_KEY, 'denied');
      await AsyncStorage.removeItem(LOCATION_CACHE_KEY);
      setLocationContext({
        timeOfDay: getTimeOfDay(),
        isGranted: false,
        isLoading: false,
      });
      logger.debug('[useLocation] Location consent revoked');
    } catch (error) {
      logger.error('[useLocation] Failed to revoke consent', { error });
    }
  }, []);

  const refreshLocation = useCallback(async () => {
    if (locationContext.isGranted) {
      await AsyncStorage.removeItem(LOCATION_CACHE_KEY);
      await fetchLocation();
    }
  }, [locationContext.isGranted]);

  return {
    locationContext,
    hasAskedConsent,
    requestLocationPermission,
    revokeLocationConsent,
    refreshLocation,
  };
}

export function getLocationBasedSuggestion(context: LocationContext): string | null {
  const { city, timeOfDay } = context;

  const suggestions: Record<string, string[]> = {
    morning: [
      'peaceful sunrise meditation',
      'energizing morning rhythm',
      'gentle awakening melody',
      'mindful morning reflection',
    ],
    afternoon: [
      'focused afternoon flow',
      'productive work companion',
      'calming midday pause',
      'creative afternoon inspiration',
    ],
    evening: [
      'relaxing evening wind-down',
      'sunset contemplation',
      'peaceful evening reflection',
      'gentle transition to rest',
    ],
    night: ['deep night relaxation', 'peaceful sleep preparation', 'night sky meditation', 'tranquil night journey'],
  };

  const timeSuggestions = suggestions[timeOfDay] || suggestions.morning;
  const randomSuggestion = timeSuggestions[Math.floor(Math.random() * timeSuggestions.length)];

  if (city) {
    return `${randomSuggestion} in ${city}`;
  }

  return randomSuggestion;
}
