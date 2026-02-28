import { useState, useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { useAdminProviders, useAdminMusicApiCredits, type ProviderConfiguration } from '@/hooks/admin';
import { SectionHeader, LoadingSection, ErrorSection, createSharedStyles } from './shared';
import {
  MusicApiCreditsCard,
  MusicProviderCard,
  MusicProviderEditModal,
  AIProviderCard,
  AIProviderEditModal,
  ImageProviderCard,
  ImageProviderEditModal,
  createProviderStyles,
} from './providers';

export function AdminProvidersSection() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProviderStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const { data: rawProviders, isLoading, error } = useAdminProviders();
  const { data: musicApiCredits } = useAdminMusicApiCredits();
  const [editingProvider, setEditingProvider] = useState<ProviderConfiguration | null>(null);
  const [editingAIProvider, setEditingAIProvider] = useState<ProviderConfiguration | null>(null);
  const [editingImageProvider, setEditingImageProvider] = useState<ProviderConfiguration | null>(null);

  const providers = Array.isArray(rawProviders) ? rawProviders : [];
  const musicProvider = providers.find(p => p.providerType === 'music');
  const aiProviders = providers.filter(p => p.providerType === 'llm');
  const imageProviders = providers.filter(p => p.providerType === 'image');

  if (isLoading) return <LoadingSection />;
  if (error) return <ErrorSection message={t('admin.providers.failedToLoad')} />;

  return (
    <View style={sharedStyles.section}>
      <SectionHeader title={t('admin.providers.title')} icon="cloud-outline" />

      {aiProviders.length > 0 && (
        <>
          <Text style={styles.providerCategoryTitle} data-testid="text-ai-providers-title">
            AI Providers
          </Text>
          {aiProviders.map(provider => (
            <AIProviderCard key={provider.id} provider={provider} onEdit={() => setEditingAIProvider(provider)} />
          ))}
        </>
      )}

      {imageProviders.length > 0 && (
        <>
          <Text style={styles.providerCategoryTitle} data-testid="text-image-providers-title">
            Image Providers
          </Text>
          {imageProviders.map(provider => (
            <ImageProviderCard key={provider.id} provider={provider} onEdit={() => setEditingImageProvider(provider)} />
          ))}
        </>
      )}

      <Text style={styles.providerCategoryTitle} data-testid="text-music-providers-title">
        Music Providers
      </Text>

      {musicApiCredits && <MusicApiCreditsCard credits={musicApiCredits} />}

      {musicProvider && <MusicProviderCard provider={musicProvider} onEdit={() => setEditingProvider(musicProvider)} />}

      {editingProvider && (
        <MusicProviderEditModal provider={editingProvider} onClose={() => setEditingProvider(null)} />
      )}

      {editingAIProvider && (
        <AIProviderEditModal provider={editingAIProvider} onClose={() => setEditingAIProvider(null)} />
      )}

      {editingImageProvider && (
        <ImageProviderEditModal provider={editingImageProvider} onClose={() => setEditingImageProvider(null)} />
      )}
    </View>
  );
}
