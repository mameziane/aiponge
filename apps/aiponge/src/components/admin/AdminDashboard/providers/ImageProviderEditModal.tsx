import { useState, useMemo } from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { useUpdateProviderConfiguration, type ProviderConfiguration } from '@/hooks/admin';
import { getImageProviderModels, getCostTierInfo, OPENAI_IMAGE_MODELS } from '@/constants/aiProviderPricing';
import { ProviderEditModalShell } from './ProviderEditModalShell';
import { createProviderStyles } from './styles';
import { detectImageProviderFromConfig } from './utils';
import { logger } from '@/lib/logger';
import type { ImageConfig } from './types';

export function ImageProviderEditModal({
  provider,
  onClose,
}: {
  provider: ProviderConfiguration;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProviderStyles(colors), [colors]);
  const updateMutation = useUpdateProviderConfiguration();
  const config = provider.configuration as unknown as ImageConfig;

  const providerId = detectImageProviderFromConfig(config, provider.providerName);
  const availableModels = getImageProviderModels(providerId);
  const fallbackModels = availableModels.length > 0 ? availableModels : OPENAI_IMAGE_MODELS;

  const [priority, setPriority] = useState(String(provider.priority));
  const [timeout, setTimeout] = useState(String(config?.timeout || 60000));
  const [selectedModel, setSelectedModel] = useState(config?.requestTemplate?.model || 'dall-e-3');
  const [selectedSize, setSelectedSize] = useState(config?.requestTemplate?.size || '1024x1024');
  const [selectedQuality, setSelectedQuality] = useState(config?.requestTemplate?.quality || 'standard');
  const [isActive, setIsActive] = useState(provider.isActive);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showSizePicker, setShowSizePicker] = useState(false);

  const selectedModelInfo = fallbackModels.find(m => m.id === selectedModel);
  const costTierInfo = selectedModelInfo?.costTier ? getCostTierInfo(selectedModelInfo.costTier) : null;
  const availableSizes = selectedModelInfo?.sizes || ['1024x1024'];

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
          size: selectedSize,
          quality: selectedQuality,
        },
      },
    };

    try {
      await updateMutation.mutateAsync({ id: provider.id, updates });
      onClose();
    } catch (err) {
      logger.error(
        '[ImageProviderEditModal] Failed to update image provider:',
        err instanceof Error ? err : undefined,
        { error: err }
      );
    }
  };

  return (
    <ProviderEditModalShell
      title={provider.providerName}
      onClose={onClose}
      onSave={handleSave}
      isSaving={updateMutation.isPending}
      saveError={updateMutation.error as Error | null}
      testIdPrefix="image-"
    >
      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>{t('admin.providers.status')}</Text>
        <View style={styles.toggleField}>
          <Text style={styles.formLabel}>{t('admin.providers.providerActive')}</Text>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ false: colors.text.gray[600], true: colors.brand.primary }}
            data-testid="switch-image-active"
          />
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>{t('admin.providers.modelSelection')}</Text>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>{t('admin.providers.model')}</Text>
          <Text style={styles.formHint}>{t('admin.providers.selectImageModel')}</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setShowModelPicker(!showModelPicker)}
            data-testid="select-image-model"
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
              {fallbackModels.map(model => {
                const tierInfo = model.costTier ? getCostTierInfo(model.costTier) : null;
                return (
                  <TouchableOpacity
                    key={model.id}
                    style={[styles.pickerOption, selectedModel === model.id && styles.pickerOptionSelected]}
                    onPress={() => {
                      setSelectedModel(model.id);
                      if (!model.sizes.includes(selectedSize)) {
                        setSelectedSize(model.sizes[0]);
                      }
                      setShowModelPicker(false);
                    }}
                    data-testid={`option-image-model-${model.id}`}
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
                      {tierInfo && (
                        <View style={[styles.costBadge, { backgroundColor: tierInfo.color + '20' }]}>
                          <Text style={[styles.costBadgeText, { color: tierInfo.color }]}>{tierInfo.label}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.modelDescription}>{model.description}</Text>
                    <Text style={styles.modelDescription}>Cost: ${model.costPerImage.toFixed(2)}/image</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>{t('admin.providers.imageSettings')}</Text>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>{t('admin.providers.size')}</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setShowSizePicker(!showSizePicker)}
            data-testid="select-image-size"
          >
            <Text style={styles.selectInputText}>{selectedSize}</Text>
            <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
          {showSizePicker && (
            <View style={styles.pickerDropdown}>
              {availableSizes.map(size => (
                <TouchableOpacity
                  key={size}
                  style={[styles.pickerOption, selectedSize === size && styles.pickerOptionSelected]}
                  onPress={() => {
                    setSelectedSize(size);
                    setShowSizePicker(false);
                  }}
                  data-testid={`option-image-size-${size}`}
                >
                  <Text style={[styles.pickerOptionText, selectedSize === size && styles.pickerOptionTextSelected]}>
                    {size}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.formField}>
          <Text style={styles.formLabel}>{t('admin.providers.quality')}</Text>
          <View style={styles.qualityButtonRow}>
            <TouchableOpacity
              style={[styles.qualityButton, selectedQuality === 'standard' && styles.qualityButtonSelected]}
              onPress={() => setSelectedQuality('standard')}
              data-testid="button-quality-standard"
            >
              <Text
                style={[styles.qualityButtonText, selectedQuality === 'standard' && styles.qualityButtonTextSelected]}
              >
                Standard
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.qualityButton, selectedQuality === 'hd' && styles.qualityButtonSelected]}
              onPress={() => setSelectedQuality('hd')}
              data-testid="button-quality-hd"
            >
              <Text style={[styles.qualityButtonText, selectedQuality === 'hd' && styles.qualityButtonTextSelected]}>
                HD
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>{t('admin.providers.advanced')}</Text>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>Timeout (ms)</Text>
          <TextInput
            style={styles.textInput}
            value={timeout}
            onChangeText={setTimeout}
            keyboardType="numeric"
            placeholder="60000"
            placeholderTextColor={colors.text.tertiary}
            data-testid="input-image-timeout"
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
            data-testid="input-image-priority"
          />
        </View>
      </View>
    </ProviderEditModalShell>
  );
}
