import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as SecureStore from 'expo-secure-store';
import { useSearchStore } from '../../stores/searchStore';
import { getLastVisitedTab, setLastVisitedTab, clearLastVisitedTab } from '../../stores/lastTabStore';
import { getUserModeActive, setUserModeActive, clearUserModeActive } from '../../stores/userModeStore';

vi.mock('../../lib/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('searchStore', () => {
  beforeEach(() => {
    useSearchStore.setState({ query: '', isSearchActive: false, currentConfig: null });
  });

  it('should have correct initial state', () => {
    const state = useSearchStore.getState();
    expect(state.query).toBe('');
    expect(state.isSearchActive).toBe(false);
    expect(state.currentConfig).toBeNull();
  });

  describe('setQuery', () => {
    it('should update query', () => {
      useSearchStore.getState().setQuery('test query');
      expect(useSearchStore.getState().query).toBe('test query');
    });

    it('should call currentConfig.onSearch when config is registered', () => {
      const onSearch = vi.fn();
      const onClear = vi.fn();
      useSearchStore.getState().registerSearch({
        placeholder: 'Search...',
        enabled: true,
        onSearch,
        onClear,
      });
      useSearchStore.getState().setQuery('hello');
      expect(onSearch).toHaveBeenCalledWith('hello');
    });

    it('should update query without error when no config is registered', () => {
      useSearchStore.getState().setQuery('no config');
      expect(useSearchStore.getState().query).toBe('no config');
    });
  });

  describe('setIsSearchActive', () => {
    it('should set isSearchActive to true', () => {
      useSearchStore.getState().setIsSearchActive(true);
      expect(useSearchStore.getState().isSearchActive).toBe(true);
    });

    it('should clear query when set to false', () => {
      useSearchStore.getState().setQuery('something');
      useSearchStore.getState().setIsSearchActive(false);
      expect(useSearchStore.getState().isSearchActive).toBe(false);
      expect(useSearchStore.getState().query).toBe('');
    });

    it('should call currentConfig.onClear when set to false', () => {
      const onClear = vi.fn();
      useSearchStore.getState().registerSearch({
        placeholder: 'Search...',
        enabled: true,
        onSearch: vi.fn(),
        onClear,
      });
      useSearchStore.getState().setIsSearchActive(false);
      expect(onClear).toHaveBeenCalled();
    });
  });

  describe('registerSearch', () => {
    it('should set currentConfig', () => {
      const config = {
        placeholder: 'Search...',
        enabled: true,
        onSearch: vi.fn(),
        onClear: vi.fn(),
      };
      useSearchStore.getState().registerSearch(config);
      expect(useSearchStore.getState().currentConfig).toEqual(config);
    });
  });

  describe('unregisterSearch', () => {
    it('should clear currentConfig, query, and isSearchActive', () => {
      useSearchStore.getState().registerSearch({
        placeholder: 'Search...',
        enabled: true,
        onSearch: vi.fn(),
        onClear: vi.fn(),
      });
      useSearchStore.getState().setQuery('test');
      useSearchStore.getState().setIsSearchActive(true);

      useSearchStore.getState().unregisterSearch();

      const state = useSearchStore.getState();
      expect(state.currentConfig).toBeNull();
      expect(state.query).toBe('');
      expect(state.isSearchActive).toBe(false);
    });
  });
});

describe('lastTabStore', () => {
  beforeEach(() => {
    vi.mocked(SecureStore.getItemAsync).mockReset().mockResolvedValue(null);
    vi.mocked(SecureStore.setItemAsync).mockReset().mockResolvedValue();
    vi.mocked(SecureStore.deleteItemAsync).mockReset().mockResolvedValue();
  });

  describe('getLastVisitedTab', () => {
    it('should return null when no stored value', async () => {
      const result = await getLastVisitedTab();
      expect(result).toBeNull();
    });

    it('should return valid tab name when stored', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('music');
      const result = await getLastVisitedTab();
      expect(result).toBe('music');
    });

    it('should return valid tab "books"', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('books');
      const result = await getLastVisitedTab();
      expect(result).toBe('books');
    });

    it('should return valid tab "create"', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('create');
      const result = await getLastVisitedTab();
      expect(result).toBe('create');
    });

    it('should return valid tab "reflect"', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('reflect');
      const result = await getLastVisitedTab();
      expect(result).toBe('reflect');
    });

    it('should return valid tab "reports"', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('reports');
      const result = await getLastVisitedTab();
      expect(result).toBe('reports');
    });

    it('should migrate "explore" to "music"', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('explore');
      const result = await getLastVisitedTab();
      expect(result).toBe('music');
    });

    it('should migrate "journal" to "books"', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('journal');
      const result = await getLastVisitedTab();
      expect(result).toBe('books');
    });

    it('should migrate "home" to "music"', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('home');
      const result = await getLastVisitedTab();
      expect(result).toBe('music');
    });

    it('should migrate "library" to "music"', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('library');
      const result = await getLastVisitedTab();
      expect(result).toBe('music');
    });

    it('should return null for invalid tab name', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('invalidtab');
      const result = await getLastVisitedTab();
      expect(result).toBeNull();
    });

    it('should return null on SecureStore error', async () => {
      vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('SecureStore error'));
      const result = await getLastVisitedTab();
      expect(result).toBeNull();
    });
  });

  describe('setLastVisitedTab', () => {
    it('should store valid tab name', async () => {
      await setLastVisitedTab('music');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('aiponge_last_tab', 'music');
    });

    it('should strip route prefix "/(user)/music"', async () => {
      await setLastVisitedTab('/(user)/music');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('aiponge_last_tab', 'music');
    });

    it('should ignore invalid tab names', async () => {
      await setLastVisitedTab('invalidtab');
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    });

    it('should handle SecureStore error gracefully', async () => {
      vi.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error('write error'));
      await expect(setLastVisitedTab('music')).resolves.toBeUndefined();
    });
  });

  describe('clearLastVisitedTab', () => {
    it('should call deleteItemAsync with correct key', async () => {
      await clearLastVisitedTab();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('aiponge_last_tab');
    });

    it('should handle error gracefully', async () => {
      vi.mocked(SecureStore.deleteItemAsync).mockRejectedValue(new Error('delete error'));
      await expect(clearLastVisitedTab()).resolves.toBeUndefined();
    });
  });
});

describe('userModeStore', () => {
  beforeEach(() => {
    vi.mocked(SecureStore.getItemAsync).mockReset().mockResolvedValue(null);
    vi.mocked(SecureStore.setItemAsync).mockReset().mockResolvedValue();
    vi.mocked(SecureStore.deleteItemAsync).mockReset().mockResolvedValue();
  });

  describe('getUserModeActive', () => {
    it('should return false when no stored value', async () => {
      const result = await getUserModeActive();
      expect(result).toBe(false);
    });

    it('should return true when stored value is "true"', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('true');
      const result = await getUserModeActive();
      expect(result).toBe(true);
    });

    it('should return false when stored value is "false"', async () => {
      vi.mocked(SecureStore.getItemAsync).mockResolvedValue('false');
      const result = await getUserModeActive();
      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      vi.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error('read error'));
      const result = await getUserModeActive();
      expect(result).toBe(false);
    });
  });

  describe('setUserModeActive', () => {
    it('should store "true" when active=true', async () => {
      await setUserModeActive(true);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('aiponge_user_mode_active', 'true');
    });

    it('should store "false" when active=false', async () => {
      await setUserModeActive(false);
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith('aiponge_user_mode_active', 'false');
    });

    it('should handle error gracefully', async () => {
      vi.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error('write error'));
      await expect(setUserModeActive(true)).resolves.toBeUndefined();
    });
  });

  describe('clearUserModeActive', () => {
    it('should call deleteItemAsync', async () => {
      await clearUserModeActive();
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('aiponge_user_mode_active');
    });

    it('should handle error gracefully', async () => {
      vi.mocked(SecureStore.deleteItemAsync).mockRejectedValue(new Error('delete error'));
      await expect(clearUserModeActive()).resolves.toBeUndefined();
    });
  });
});
