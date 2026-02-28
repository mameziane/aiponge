import { useCallback, useMemo } from 'react';
import { useAuthStore, selectUser } from '../../auth/store';
import { TrackForMenu } from '../../components/music/TrackOptionsMenu';
import { useIsAdmin } from '../admin/useAdminQuery';
import { USER_ROLES } from '@aiponge/shared-contracts';

export type ScreenContext = 'myMusic' | 'musicGeneration' | 'sharedLibrary' | 'explore';

const OWNER_SCREENS: ScreenContext[] = ['myMusic', 'musicGeneration'];

function canDeleteTrack(screen: ScreenContext, isOwnerScreen: boolean, isAdmin: boolean): boolean {
  if (isOwnerScreen) return true;
  if (screen === 'sharedLibrary' && isAdmin) return true;
  return false;
}

export interface TrackMenuProps {
  isFavorite: boolean;
  onToggleFavorite?: () => void;
  onShowLyrics?: () => void;
  onRemoveFromLibrary?: () => void;
  onTrackUpdated?: () => void;
  showEditOption: boolean;
}

export interface TrackHandlers<T extends TrackForMenu> {
  handleShowLyrics: (track: T) => void;
  toggleFavorite: (trackId: string) => void;
  isFavorite: (trackId: string) => boolean;
  handleDeleteTrack?: (trackId: string) => void;
  handleTrackUpdated?: () => void;
}

export interface UseTrackOptionsScreenResult<T extends TrackForMenu> {
  isOwnerScreen: boolean;
  isAdmin: boolean;
  isAuthenticated: boolean;
  getMenuPropsForTrack: (track: T) => TrackMenuProps;
}

export function useTrackOptionsScreen<T extends TrackForMenu>(
  screenContext: ScreenContext,
  handlers: TrackHandlers<T>
): UseTrackOptionsScreenResult<T> {
  const user = useAuthStore(selectUser);

  const isAuthenticated = !!user;
  const isAdmin = useIsAdmin();
  const isOwnerScreen = OWNER_SCREENS.includes(screenContext);

  const getMenuPropsForTrack = useCallback(
    (track: T): TrackMenuProps => {
      const hasLyrics = !!track.lyricsId;
      const isUserContent = track.isUserGenerated ?? false;
      const trackIsFavorite = isAuthenticated ? handlers.isFavorite(track.id) : false;

      return {
        isFavorite: trackIsFavorite,
        onToggleFavorite: isAuthenticated ? () => handlers.toggleFavorite(track.id) : undefined,
        onShowLyrics: hasLyrics ? () => handlers.handleShowLyrics(track) : undefined,
        onRemoveFromLibrary:
          canDeleteTrack(screenContext, isOwnerScreen, isAdmin) && handlers.handleDeleteTrack
            ? () => handlers.handleDeleteTrack!(track.id)
            : undefined,
        onTrackUpdated: handlers.handleTrackUpdated,
        showEditOption: isOwnerScreen && isUserContent,
      };
    },
    [isAuthenticated, isOwnerScreen, isAdmin, screenContext, handlers]
  );

  return {
    isOwnerScreen,
    isAdmin,
    isAuthenticated,
    getMenuPropsForTrack,
  };
}

export interface ScreenPermissions {
  isOwnerScreen: boolean;
  canFavorite: boolean;
  canEdit: boolean;
  canRemove: boolean;
  canShareToLibrary: boolean;
  canMoveToSharedLibrary: boolean;
}

export function getScreenPermissions(
  screenContext: ScreenContext,
  userId: string | undefined,
  userRole: string | undefined
): ScreenPermissions {
  const isOwnerScreen = OWNER_SCREENS.includes(screenContext);
  const isAuthenticated = !!userId;
  const isAdmin = userRole === USER_ROLES.ADMIN;

  return {
    isOwnerScreen,
    canFavorite: isAuthenticated,
    canEdit: isOwnerScreen,
    canRemove: canDeleteTrack(screenContext, isOwnerScreen, isAdmin),
    canShareToLibrary: isOwnerScreen,
    canMoveToSharedLibrary: isAdmin && isOwnerScreen,
  };
}

export default useTrackOptionsScreen;
