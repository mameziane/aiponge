/**
 * Generate deterministic artwork for playlists
 * Creates unique gradient colors based on playlist name
 */

// Predefined color palette for playlist gradients
const GRADIENT_COLORS = [
  { start: '#8B5CF6', end: '#6366F1' }, // Purple to Indigo
  { start: '#EC4899', end: '#F43F5E' }, // Pink to Rose
  { start: '#14B8A6', end: '#06B6D4' }, // Teal to Cyan
  { start: '#F59E0B', end: '#EF4444' }, // Amber to Red
  { start: '#10B981', end: '#3B82F6' }, // Emerald to Blue
  { start: '#A855F7', end: '#EC4899' }, // Purple to Pink
  { start: '#6366F1', end: '#8B5CF6' }, // Indigo to Purple
  { start: '#F97316', end: '#F59E0B' }, // Orange to Amber
  { start: '#06B6D4', end: '#8B5CF6' }, // Cyan to Purple
  { start: '#EF4444', end: '#F97316' }, // Red to Orange
];

/**
 * Simple string hash function
 * Returns a consistent number for a given string
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get gradient colors for a playlist based on its name
 */
export function getPlaylistGradient(playlistName: string): { start: string; end: string } {
  const hash = hashString(playlistName);
  const index = hash % GRADIENT_COLORS.length;
  return GRADIENT_COLORS[index];
}

/**
 * Get the first letter of playlist name for display
 */
export function getPlaylistInitial(playlistName: string): string {
  return playlistName.charAt(0).toUpperCase();
}
