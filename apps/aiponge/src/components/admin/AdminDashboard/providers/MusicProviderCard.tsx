import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { useTestProviderConfiguration, useSetProviderAsPrimary, type ProviderConfiguration } from '@/hooks/admin';
import { ProviderHeader } from './ProviderHeader';
import { ProviderActionRow } from './ProviderActionRow';
import { ProviderMutationResults } from './ProviderMutationResults';
import { createProviderStyles } from './styles';
import type { MusicApiConfig } from './types';

export function MusicProviderCard({ provider, onEdit }: { provider: ProviderConfiguration; onEdit: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProviderStyles(colors), [colors]);
  const testMutation = useTestProviderConfiguration();
  const setPrimaryMutation = useSetProviderAsPrimary();
  const config = provider.configuration as unknown as MusicApiConfig;

  return (
    <View style={styles.providerCard} data-testid={`card-provider-${provider.id}`}>
      <ProviderHeader provider={provider} icon="musical-notes-outline" />

      <View style={styles.configSection} data-testid="section-provider-config">
        <Text style={styles.configSectionTitle}>{t('admin.providers.currentConfiguration')}</Text>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.priority')}</Text>
          <Text style={styles.configValue} data-testid="text-config-priority">
            {provider.priority}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.endpoint')}</Text>
          <Text style={styles.configValue} data-testid="text-config-endpoint" numberOfLines={1}>
            {config?.endpoint || 'N/A'}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.timeout')}</Text>
          <Text style={styles.configValue} data-testid="text-config-timeout">
            {config?.timeout ? `${config.timeout}ms` : 'N/A'}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.model')}</Text>
          <Text style={styles.configValue} data-testid="text-config-model">
            {config?.requestTemplate?.mv || 'N/A'}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.defaultDuration')}</Text>
          <Text style={styles.configValue} data-testid="text-config-duration">
            {config?.requestTemplate?.duration ? `${config.requestTemplate.duration}s` : 'N/A'}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.instrumental')}</Text>
          <Text style={styles.configValue} data-testid="text-config-instrumental">
            {config?.requestTemplate?.make_instrumental ? 'Yes' : 'No'}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.customMode')}</Text>
          <Text style={styles.configValue} data-testid="text-config-custom-mode">
            {config?.requestTemplate?.custom_mode ? 'Yes' : 'No'}
          </Text>
        </View>
      </View>

      <ProviderActionRow
        providerId={String(provider.id)}
        providerType={provider.providerType}
        isPrimary={provider.isPrimary}
        testIsPending={testMutation.isPending}
        setPrimaryIsPending={setPrimaryMutation.isPending}
        onTest={() => testMutation.mutate(provider.id)}
        onEdit={onEdit}
        onSetPrimary={() => setPrimaryMutation.mutate({ id: provider.id, providerType: provider.providerType })}
      />

      <ProviderMutationResults
        setPrimaryIsSuccess={setPrimaryMutation.isSuccess}
        setPrimaryIsError={setPrimaryMutation.isError}
        setPrimaryError={setPrimaryMutation.error as Error | null}
        testIsSuccess={testMutation.isSuccess}
        testData={testMutation.data}
      />
    </View>
  );
}
