import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { UnifiedHeader } from '../../src/components/shared/UnifiedHeader';
import { MiniPlayer } from '../../src/components/music/MiniPlayer';

export default function LibraryLayout() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Stack
        screenOptions={{
          headerShown: true,
          header: ({ options }) => (
            <UnifiedHeader title={options.title || ''} showBackButton />
          ),
        }}
      >
        <Stack.Screen name="albums" options={{ title: t('albums.title') }} />
        <Stack.Screen name="album-detail" options={{ title: t('albums.albumDetail') }} />
        <Stack.Screen name="private-track-detail" options={{ headerShown: false }} />
        <Stack.Screen name="playlists" options={{ title: t('navigation.playlists') }} />
        <Stack.Screen name="downloads" options={{ title: t('navigation.downloads') }} />
        <Stack.Screen name="private-music-library" options={{ title: t('navigation.myCreations') }} />
        <Stack.Screen name="music-library" options={{ title: t('navigation.sharedLibrary') }} />
        <Stack.Screen name="private-book-detail" options={{ headerShown: false }} />
        <Stack.Screen name="book-detail" options={{ headerShown: false }} />
        <Stack.Screen name="book-reader" options={{ headerShown: false }} />
      </Stack>
      <MiniPlayer />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
