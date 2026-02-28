import type {
  ExploreTrack,
  UserCreation,
  ExplorePlaylist,
  ChartTrack,
  WorkInProgress,
} from '../../hooks/playlists/useExploreData';
import type { UserAlbum } from '../../hooks/music/useAlbums';
import type { SharedAlbum } from '../../hooks/playlists/useSharedAlbums';
import type { AlbumGenerationProgress, TrackGenerationProgress } from '../../stores';

export interface TrackCallbacks {
  onTrackPress: (track: ExploreTrack | UserCreation) => void;
  onTrackLongPress: (track: ExploreTrack | UserCreation) => void;
  onToggleFavorite?: (trackId: string) => void;
  onShowLyrics: (params: { title: string; lyricsId?: string }) => void;
  isLiked: (trackId: string) => boolean;
  canLike: boolean;
  currentTrackId?: string;
  isPlaying: boolean;
}

export type {
  ExploreTrack,
  UserCreation,
  ExplorePlaylist,
  ChartTrack,
  WorkInProgress,
  UserAlbum,
  SharedAlbum,
  AlbumGenerationProgress,
  TrackGenerationProgress,
};
