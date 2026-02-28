import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { useTestProviderConfiguration, useSetProviderAsPrimary, type ProviderConfiguration } from '@/hooks/admin';
import { getModelPricing, getCostTierInfo } from '@/constants/aiProviderPricing';
import { ProviderHeader } from './ProviderHeader';
import { ProviderActionRow } from './ProviderActionRow';
import { ProviderMutationResults } from './ProviderMutationResults';
import { createProviderStyles } from './styles';
import { detectProviderFromConfig } from './utils';
import type { LLMConfig } from './types';

export function AIProviderCard({ provider, onEdit }: { provider: ProviderConfiguration; onEdit: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProviderStyles(colors), [colors]);
  const testMutation = useTestProviderConfiguration();
  const setPrimaryMutation = useSetProviderAsPrimary();
  const config = provider.configuration as unknown as LLMConfig;

  const providerId = detectProviderFromConfig(config, provider.providerName);
  const currentModel =
    config?.requestTemplate?.model || (providerId === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'gpt-3.5-turbo');
  const modelPricing = getModelPricing(providerId, currentModel);
  const costTierInfo = modelPricing ? getCostTierInfo(modelPricing.costTier) : null;

  return (
    <View style={styles.providerCard} data-testid={`card-ai-provider-${provider.id}`}>
      <ProviderHeader provider={provider} icon="sparkles-outline" testIdPrefix="ai-" />

      <View style={styles.configSection} data-testid="section-ai-provider-config">
        <Text style={styles.configSectionTitle}>{t('admin.providers.currentConfiguration')}</Text>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.model')}</Text>
          <View style={styles.modelValueRow}>
            <Text style={styles.configValue} data-testid="text-ai-config-model">
              {modelPricing?.name || currentModel}
            </Text>
            {costTierInfo && (
              <View style={[styles.costBadge, { backgroundColor: costTierInfo.color + '20' }]}>
                <Text style={[styles.costBadgeText, { color: costTierInfo.color }]} data-testid="text-ai-cost-tier">
                  {costTierInfo.label}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.priority')}</Text>
          <Text style={styles.configValue} data-testid="text-ai-config-priority">
            {provider.priority}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.timeout')}</Text>
          <Text style={styles.configValue} data-testid="text-ai-config-timeout">
            {config?.timeout ? `${config.timeout}ms` : 'N/A'}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.temperature')}</Text>
          <Text style={styles.configValue} data-testid="text-ai-config-temperature">
            {config?.requestTemplate?.temperature !== undefined ? config.requestTemplate.temperature : '0.7'}
          </Text>
        </View>
        <View style={styles.configRow}>
          <Text style={styles.configLabel}>{t('admin.providers.endpoint')}</Text>
          <Text style={styles.configValue} data-testid="text-ai-config-endpoint" numberOfLines={1}>
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
        testIdPrefix="ai-"
      />

      <ProviderMutationResults
        setPrimaryIsSuccess={setPrimaryMutation.isSuccess}
        setPrimaryIsError={setPrimaryMutation.isError}
        setPrimaryError={setPrimaryMutation.error as Error | null}
        testIsSuccess={testMutation.isSuccess}
        testData={testMutation.data}
        testIdPrefix="ai-"
      />
    </View>
  );
}
