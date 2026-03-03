/**
 * AsyncStorage helpers for persisting book generation state across navigation.
 * Used during onboarding: generation starts on the onboarding screen, but the user
 * navigates to the Books screen where usePendingBookGeneration resumes polling.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_KEY = '@aiponge:pending_book_generation';
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export interface PendingBookGeneration {
  requestId: string;
  bookTypeId: string;
  description: string;
  startedAt: number;
}

export async function savePendingBookGeneration(data: PendingBookGeneration): Promise<void> {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(data));
}

export async function getPendingBookGeneration(): Promise<PendingBookGeneration | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingBookGeneration;
    if (Date.now() - parsed.startedAt > MAX_AGE_MS) {
      await AsyncStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed;
  } catch {
    await AsyncStorage.removeItem(PENDING_KEY);
    return null;
  }
}

export async function clearPendingBookGeneration(): Promise<void> {
  await AsyncStorage.removeItem(PENDING_KEY);
}
