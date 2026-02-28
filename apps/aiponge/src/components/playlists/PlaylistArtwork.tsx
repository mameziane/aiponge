import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getPlaylistGradient, getPlaylistInitial } from '../../utils/playlistArtwork';

interface PlaylistArtworkProps {
  playlistName: string;
  size?: number;
}

export function PlaylistArtwork({ playlistName, size = 160 }: PlaylistArtworkProps) {
  const gradient = getPlaylistGradient(playlistName);
  const initial = getPlaylistInitial(playlistName);

  return (
    <LinearGradient
      colors={[gradient.start, gradient.end]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { width: size, height: size }]}
    >
      <Text style={[styles.initial, { fontSize: size * 0.5 }]}>{initial}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: {
    color: 'white',
    fontWeight: '700',
    opacity: 0.9,
  },
});
