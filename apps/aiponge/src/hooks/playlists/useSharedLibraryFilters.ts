import { useState, useEffect, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAuthStore, selectUserId } from '../../auth/store';
import { SUPPORTED_LANGUAGES } from '../../i18n/types';

export interface SharedLibraryFilters {
  searchQuery: string;
  selectedGenre: string;
  selectedLanguage: string;
  selectedPlaylistId: string | null;
  smartKey: string | null;
}

export interface SharedLibraryFiltersReturn {
  filters: SharedLibraryFilters;
  setSearchQuery: (query: string) => void;
  setSelectedGenre: (genre: string) => void;
  setSelectedLanguage: (language: string) => void;
  setSelectedPlaylistId: (id: string | null) => void;
  tracksQueryKey: (string | { search: string; genreFilter: string; languageFilter: string })[];
  tracksEndpoint: string;
  languageOptions: { code: string; name: string }[];
}

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGES.map(lang => ({
  code: lang.code.split('-')[0],
  name: lang.nativeLabel,
}));

export function useSharedLibraryFilters(): SharedLibraryFiltersReturn {
  const params = useLocalSearchParams<{ selectPlaylist?: string; smartKey?: string }>();
  const userId = useAuthStore(selectUserId);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(params.selectPlaylist || null);
  const [smartKey, setSmartKey] = useState<string | null>(params.smartKey || null);

  useEffect(() => {
    if (params.selectPlaylist) {
      setSelectedPlaylistId(params.selectPlaylist);
    }
    if (params.smartKey) {
      setSmartKey(params.smartKey);
    } else {
      setSmartKey(null);
    }
  }, [params.selectPlaylist, params.smartKey]);

  const { queryKey, endpoint } = useMemo(() => {
    const queryParams = new URLSearchParams();
    if (searchQuery) queryParams.append('search', searchQuery);
    if (selectedGenre) queryParams.append('genreFilter', selectedGenre);
    if (selectedLanguage) queryParams.append('languageFilter', selectedLanguage);
    const queryString = queryParams.toString();

    if (smartKey && userId) {
      const ep = `/api/v1/app/playlists/smart/${userId}/${smartKey}/tracks`;
      const qk = [
        '/api/v1/app/playlists/smart',
        userId,
        smartKey,
        'tracks',
        { search: searchQuery, genreFilter: selectedGenre, languageFilter: selectedLanguage },
      ];
      return { queryKey: qk, endpoint: ep };
    }

    if (selectedPlaylistId) {
      const ep = `/api/v1/app/playlists/${selectedPlaylistId}/tracks${queryString ? `?${queryString}` : ''}`;
      const qk = [
        '/api/v1/app/playlists',
        selectedPlaylistId,
        'tracks',
        { search: searchQuery, genreFilter: selectedGenre, languageFilter: selectedLanguage },
      ];
      return { queryKey: qk, endpoint: ep };
    }

    const ep = `/api/v1/app/library/shared${queryString ? `?${queryString}` : ''}`;
    const qk = [
      '/api/v1/app/library/shared',
      { search: searchQuery, genreFilter: selectedGenre, languageFilter: selectedLanguage },
    ];
    return { queryKey: qk, endpoint: ep };
  }, [smartKey, userId, selectedPlaylistId, searchQuery, selectedGenre, selectedLanguage]);

  return {
    filters: {
      searchQuery,
      selectedGenre,
      selectedLanguage,
      selectedPlaylistId,
      smartKey,
    },
    setSearchQuery,
    setSelectedGenre,
    setSelectedLanguage,
    setSelectedPlaylistId,
    tracksQueryKey: queryKey,
    tracksEndpoint: endpoint,
    languageOptions: LANGUAGE_OPTIONS,
  };
}
