import { create } from 'zustand';

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

export const useSearch = () => {
  const store = useSearchStore();
  return {
    query: store.query,
    setQuery: store.setQuery,
    isSearchActive: store.isSearchActive,
    setIsSearchActive: store.setIsSearchActive,
    currentConfig: store.currentConfig,
    registerSearch: store.registerSearch,
    unregisterSearch: store.unregisterSearch,
  };
};
