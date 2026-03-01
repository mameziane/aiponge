import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

export interface SearchConfig {
  placeholder: string;
  enabled: boolean;
  onSearch: (query: string) => void;
  onClear: () => void;
}

interface SearchState {
  query: string;
  isSearchActive: boolean;
  currentConfig: SearchConfig | null;
  setQuery: (query: string) => void;
  setIsSearchActive: (active: boolean) => void;
  registerSearch: (config: SearchConfig) => void;
  unregisterSearch: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  isSearchActive: false,
  currentConfig: null,

  setQuery: (query: string) => {
    const { currentConfig } = get();
    set({ query });
    if (currentConfig?.onSearch) {
      currentConfig.onSearch(query);
    }
  },

  setIsSearchActive: (active: boolean) => {
    const { currentConfig } = get();
    set({ isSearchActive: active });
    if (!active) {
      set({ query: '' });
      currentConfig?.onClear();
    }
  },

  registerSearch: (config: SearchConfig) => {
    set({ currentConfig: config });
  },

  unregisterSearch: () => {
    set({
      currentConfig: null,
      query: '',
      isSearchActive: false,
    });
  },
}));

// Selectors for optimized re-renders
export const selectQuery = (state: SearchState) => state.query;
export const selectIsSearchActive = (state: SearchState) => state.isSearchActive;
export const selectSearchActions = (state: SearchState) => ({
  setQuery: state.setQuery,
  setIsSearchActive: state.setIsSearchActive,
  registerSearch: state.registerSearch,
  unregisterSearch: state.unregisterSearch,
});

export const useSearch = () => {
  return useSearchStore(
    useShallow(state => ({
      query: state.query,
      setQuery: state.setQuery,
      isSearchActive: state.isSearchActive,
      setIsSearchActive: state.setIsSearchActive,
      currentConfig: state.currentConfig,
      registerSearch: state.registerSearch,
      unregisterSearch: state.unregisterSearch,
    }))
  );
};
