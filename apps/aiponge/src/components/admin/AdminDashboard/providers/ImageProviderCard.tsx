import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { useTestProviderConfiguration, useSetProviderAsPrimary, type ProviderConfiguration } from '@/hooks/admin';
import { getImageModelPricing, getCostTierInfo } from '@/constants/aiProviderPricing';
import { ProviderHeader } from './ProviderHeader';
import { ProviderActionRow } from './ProviderActionRow';
import { ProviderMutationResults } from './ProviderMutationResults';
import { createProviderStyles } from './styles';
import { detectImageProviderFromConfig } from './utils';
import type { ImageConfig } from './types';

export function ImageProviderCard({ provider, onEdit }: { provider: ProviderConfiguration; onEdit: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProviderStyles(colors), [colors]);
  const testMutation = useTestProviderConfiguration();
  const setPrimaryMutation = useSetProviderAsPrimary();
  const config = provider.configuration as unknown as ImageConfig;

  const providerId = detectImageProviderFromConfig(config, provider.providerName);
  const currentModel = config?.requestTemplate?.model || 'dall-e-3';
  const modelPricing = getImageModelPricing(providerId, currentModel);
  const costTierInfo = modelPricing?.costTier ? getCostTierInfo(modelPricing.costTier) : null;

  return (
    <View style={styles.providerCard} data-testid={`card-image-provider-${provider.id}`}>
      <ProviderHeader provider={provider} icon="image-outline" testIdPrefix="image-" />

      <View style={styles.configSection} data-testid="section-image-provider-config">
        <Text style={styles.configSectionTitle}>{t('admin.providers.currentConfiguration')}</Text>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.model')}</Text>
          <View style={styles.modelValueRow}>
            <Text style={styles.configValue} data-testid="text-image-config-model">
              {modelPricing?.name || currentModel}
            </Text>
            {costTierInfo && (
              <View style={[styles.costBadge, { backgroundColor: costTierInfo.color + '20' }]}>
                <Text style={[styles.costBadgeText, { color: costTierInfo.color }]} data-testid="text-image-cost-tier">
                  {costTierInfo.label}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.priority')}</Text>
          <Text style={styles.configValue} data-testid="text-image-config-priority">
            {provider.priority}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.size')}</Text>
          <Text style={styles.configValue} data-testid="text-image-config-size">
            {config?.requestTemplate?.size || '1024x1024'}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.quality')}</Text>
          <Text style={styles.configValue} data-testid="text-image-config-quality">
            {config?.requestTemplate?.quality || 'standard'}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.endpoint')}</Text>
          <Text style={styles.configValue} data-testid="text-image-config-endpoint" numberOfLines={1}>
            {config?.endpoint || 'N/A'}
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
        testIdPrefix="image-"
      />

      <ProviderMutationResults
        setPrimaryIsSuccess={setPrimaryMutation.isSuccess}
        setPrimaryIsError={setPrimaryMutation.isError}
        setPrimaryError={setPrimaryMutation.error as Error | null}
        testIsSuccess={testMutation.isSuccess}
        testData={testMutation.data}
        testIdPrefix="image-"
      />
    </View>
  );
}
