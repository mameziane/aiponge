import { useAuthState } from '@/hooks/auth/useAuthState';
import { UnifiedSongPreferences } from '../../shared/UnifiedSongPreferences';

export function SongPreferencesTab() {
  const { userId } = useAuthState();

  return <UnifiedSongPreferences userId={userId} mode="expanded" showStyleSuggestions={true} />;
}
