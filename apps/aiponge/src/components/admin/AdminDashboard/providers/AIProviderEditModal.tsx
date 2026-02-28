import { useState, useMemo } from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { useUpdateProviderConfiguration, type ProviderConfiguration } from '@/hooks/admin';
import { getProviderModels, getCostTierInfo } from '@/constants/aiProviderPricing';
import { ProviderEditModalShell } from './ProviderEditModalShell';
import { createProviderStyles } from './styles';
import { detectProviderFromConfig } from './utils';
import { logger } from '@/lib/logger';
import type { LLMConfig } from './types';

export function AIProviderEditModal({ provider, onClose }: { provider: ProviderConfiguration; onClose: () => void }) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProviderStyles(colors), [colors]);
  const updateMutation = useUpdateProviderConfiguration();
  const config = provider.configuration as unknown as LLMConfig;

  const providerId = detectProviderFromConfig(config, provider.providerName);
  const availableModels = getProviderModels(providerId);

  const defaultModel = providerId === 'anthropic' ? 'claude-3-5-sonnet-latest' : 'gpt-3.5-turbo';
  const [priority, setPriority] = useState(String(provider.priority));
  const [timeout, setTimeout] = useState(String(config?.timeout || 60000));
  const [selectedModel, setSelectedModel] = useState(config?.requestTemplate?.model || defaultModel);
  const [temperature, setTemperature] = useState(String(config?.requestTemplate?.temperature ?? 0.7));
  const [isActive, setIsActive] = useState(provider.isActive);
  const [showModelPicker, setShowModelPicker] = useState(false);

  const selectedModelInfo = availableModels.find(m => m.id === selectedModel);
  const costTierInfo = selectedModelInfo ? getCostTierInfo(selectedModelInfo.costTier) : null;

  const handleSave = async () => {
    const updates = {
      priority: parseInt(priority, 10),
      isActive,
      configuration: {
        ...config,
        timeout: parseInt(timeout, 10),
        requestTemplate: {
          ...config?.requestTemplate,
          model: selectedModel,
          temperature: parseFloat(temperature),
        },
      },
    };

    try {
      await updateMutation.mutateAsync({ id: provider.id, updates });
      onClose();
    } catch (err) {
      logger.error('[AIProviderEditModal] Failed to update AI provider:', err instanceof Error ? err : undefined, {
        error: err,
      });
    }
  };

  return (
    <ProviderEditModalShell
      title={provider.providerName}
      onClose={onClose}
      onSave={handleSave}
      isSaving={updateMutation.isPending}
      saveError={updateMutation.error as Error | null}
      testIdPrefix="ai-"
    >
      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>{t('admin.providers.status')}</Text>
        <View style={styles.toggleField}>
          <Text style={styles.formLabel}>{t('admin.providers.providerActive')}</Text>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ false: colors.text.gray[600], true: colors.brand.primary }}
            data-testid="switch-ai-active"
          />
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>{t('admin.providers.modelSelection')}</Text>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>{t('admin.providers.model')}</Text>
          <Text style={styles.formHint}>{t('admin.providers.selectLanguageModel')}</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setShowModelPicker(!showModelPicker)}
            data-testid="select-ai-model"
          >
            <View style={styles.modelSelectContent}>
              <Text style={styles.selectInputText}>{selectedModelInfo?.name || selectedModel}</Text>
              {costTierInfo && (
                <View style={[styles.costBadge, { backgroundColor: costTierInfo.color + '20' }]}>
                  <Text style={[styles.costBadgeText, { color: costTierInfo.color }]}>{costTierInfo.label}</Text>
                </View>
              )}
            </View>
            <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
          {showModelPicker && (
            <View style={styles.pickerDropdown}>
              {availableModels.map(model => {
                const tierInfo = getCostTierInfo(model.costTier);
                return (
                  <TouchableOpacity
                    key={model.id}
                    style={[styles.pickerOption, selectedModel === model.id && styles.pickerOptionSelected]}
                    onPress={() => {
                      setSelectedModel(model.id);
                      setShowModelPicker(false);
                    }}
                    data-testid={`option-ai-model-${model.id}`}
                  >
                    <View style={styles.modelOptionContent}>
                      <View style={styles.modelOptionMain}>
                        <Text
                          style={[
                            styles.pickerOptionText,
                            selectedModel === model.id && styles.pickerOptionTextSelected,
                          ]}
                        >
                          {model.name}
                        </Text>
                        {model.recommended && (
                          <View style={styles.recommendedBadge}>
                            <Text style={styles.recommendedBadgeText}>{t('admin.providers.recommended')}</Text>
                          </View>
                        )}
                      </View>
                      <View style={[styles.costBadge, { backgroundColor: tierInfo.color + '20' }]}>
                        <Text style={[styles.costBadgeText, { color: tierInfo.color }]}>{tierInfo.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.modelDescription}>{model.description}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>{t('admin.providers.parameters')}</Text>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>{t('admin.providers.temperature')}</Text>
          <Text style={styles.formHint}>0 = deterministic, 1 = creative (default: 0.7)</Text>
          <TextInput
            style={styles.textInput}
            value={temperature}
            onChangeText={setTemperature}
            keyboardType="decimal-pad"
            placeholder="0.7"
            placeholderTextColor={colors.text.tertiary}
            data-testid="input-ai-temperature"
          />
        </View>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>Timeout (ms)</Text>
          <TextInput
            style={styles.textInput}
            value={timeout}
            onChangeText={setTimeout}
            keyboardType="numeric"
            placeholder="60000"
            placeholderTextColor={colors.text.tertiary}
            data-testid="input-ai-timeout"
          />
        </View>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>{t('admin.providers.priority')}</Text>
          <Text style={styles.formHint}>Lower value = higher priority for failover</Text>
          <TextInput
            style={styles.textInput}
            value={priority}
            onChangeText={setPriority}
            keyboardType="numeric"
            placeholder="100"
            placeholderTextColor={colors.text.tertiary}
            data-testid="input-ai-priority"
          />
        </View>
      </View>
    </ProviderEditModalShell>
  );
}
