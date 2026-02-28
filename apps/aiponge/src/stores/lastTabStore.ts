import * as SecureStore from 'expo-secure-store';
import { logger } from '../lib/logger';

const LAST_TAB_KEY = 'aiponge_last_tab';
const VALID_TABS = ['music', 'books', 'create', 'reflect', 'reports'] as const;
type TabName = (typeof VALID_TABS)[number];

const TAB_MIGRATIONS: Record<string, TabName> = {
  explore: 'music',
  home: 'music',
  library: 'music',
  journal: 'books',
};

export async function getLastVisitedTab(): Promise<TabName | null> {
  try {
    const tab = await SecureStore.getItemAsync(LAST_TAB_KEY);
    if (!tab) return null;

    const migratedTab = TAB_MIGRATIONS[tab] || tab;
    if (VALID_TABS.includes(migratedTab as TabName)) {
      return migratedTab as TabName;
    }
    return null;
  } catch (error) {
    logger.warn('[lastTabStore] Failed to get last visited tab', { error });
    return null;
  }
}

export async function setLastVisitedTab(tab: string): Promise<void> {
  try {
    const tabName = tab.replace('/(user)/', '').replace('/', '');
    if (VALID_TABS.includes(tabName as TabName)) {
      await SecureStore.setItemAsync(LAST_TAB_KEY, tabName);
    }
  } catch (error) {
    logger.warn('[lastTabStore] Failed to set last visited tab', { tab, error });
  }
}

export async function clearLastVisitedTab(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(LAST_TAB_KEY);
  } catch (error) {
    logger.warn('[lastTabStore] Failed to clear last visited tab', { error });
  }
}
