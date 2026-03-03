import { useState, useEffect, useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useAuthStore, selectUserId } from '../../auth/store';

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
  tracksQueryKey: (string | { search: string })[];
  tracksEndpoint: string;
}

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

  // Genre and language filtering is done client-side in useSharedLibrary.
  // Only search is sent server-side (it filters in the DB query for performance).
  const { queryKey, endpoint } = useMemo(() => {
    const queryParams = new URLSearchParams();
    if (searchQuery) queryParams.append('search', searchQuery);
    const queryString = queryParams.toString();

    if (smartKey && userId) {
      const ep = `/api/v1/app/playlists/smart/${userId}/${smartKey}/tracks`;
      const qk = ['/api/v1/app/playlists/smart', userId, smartKey, 'tracks', { search: searchQuery }];
      return { queryKey: qk, endpoint: ep };
    }

    if (selectedPlaylistId) {
      const ep = `/api/v1/app/playlists/${selectedPlaylistId}/tracks${queryString ? `?${queryString}` : ''}`;
      const qk = ['/api/v1/app/playlists', selectedPlaylistId, 'tracks', { search: searchQuery }];
      return { queryKey: qk, endpoint: ep };
    }

    const ep = `/api/v1/app/library/shared${queryString ? `?${queryString}` : ''}`;
    const qk = ['/api/v1/app/library/shared', { search: searchQuery }];
    return { queryKey: qk, endpoint: ep };
  }, [smartKey, userId, selectedPlaylistId, searchQuery]);

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
  };
}
