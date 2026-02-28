import { useState, useMemo } from 'react';
import { View, Text, TextInput, Switch, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { useUpdateProviderConfiguration, type ProviderConfiguration } from '@/hooks/admin';
import { ProviderEditModalShell } from './ProviderEditModalShell';
import { createProviderStyles } from './styles';
import { logger } from '@/lib/logger';
import { MODEL_VERSIONS, type MusicApiConfig } from './types';

export function MusicProviderEditModal({
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
  const config = provider.configuration as unknown as MusicApiConfig;

  const [priority, setPriority] = useState(String(provider.priority));
  const [endpoint, setEndpoint] = useState(config?.endpoint || '');
  const [timeout, setTimeout] = useState(String(config?.timeout || 120000));
  const [duration, setDuration] = useState(String(config?.requestTemplate?.duration || 180));
  const [modelVersion, setModelVersion] = useState(config?.requestTemplate?.mv || 'sonic-v5');
  const [makeInstrumental, setMakeInstrumental] = useState(config?.requestTemplate?.make_instrumental || false);
  const [customMode, setCustomMode] = useState(config?.requestTemplate?.custom_mode !== false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  const handleSave = async () => {
    const updates = {
      priority: parseInt(priority, 10),
      configuration: {
        ...config,
        endpoint,
        timeout: parseInt(timeout, 10),
        requestTemplate: {
          ...config?.requestTemplate,
          mv: modelVersion,
          duration: parseInt(duration, 10),
          make_instrumental: makeInstrumental,
          custom_mode: customMode,
        },
      },
    };

    try {
      await updateMutation.mutateAsync({ id: provider.id, updates });
      onClose();
    } catch (err) {
      logger.error('[ProviderEditModal] Failed to update provider:', err instanceof Error ? err : undefined, {
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
    >
      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>{t('admin.providers.general')}</Text>
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
            data-testid="input-priority"
          />
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>{t('admin.providers.apiConfiguration')}</Text>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>{t('admin.providers.endpointUrl')}</Text>
          <TextInput
            style={styles.textInput}
            value={endpoint}
            onChangeText={setEndpoint}
            placeholder="https://api.musicapi.ai/api/v1/sonic/create"
            placeholderTextColor={colors.text.tertiary}
            autoCapitalize="none"
            data-testid="input-endpoint"
          />
        </View>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>Timeout (ms)</Text>
          <TextInput
            style={styles.textInput}
            value={timeout}
            onChangeText={setTimeout}
            keyboardType="numeric"
            placeholder="120000"
            placeholderTextColor={colors.text.tertiary}
            data-testid="input-timeout"
          />
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formSectionTitle}>{t('admin.providers.generationDefaults')}</Text>
        <View style={styles.formField}>
          <Text style={styles.formLabel}>{t('admin.providers.modelVersion')}</Text>
          <TouchableOpacity
            style={styles.selectInput}
            onPress={() => setShowModelPicker(!showModelPicker)}
            data-testid="select-model-version"
          >
            <Text style={styles.selectInputText}>
              {MODEL_VERSIONS.find(m => m.value === modelVersion)?.label || modelVersion}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.text.secondary} />
          </TouchableOpacity>
          {showModelPicker && (
            <View style={styles.pickerDropdown}>
              {MODEL_VERSIONS.map(model => (
                <TouchableOpacity
                  key={model.value}
                  style={[styles.pickerOption, modelVersion === model.value && styles.pickerOptionSelected]}
                  onPress={() => {
                    setModelVersion(model.value);
                    setShowModelPicker(false);
                  }}
                  data-testid={`option-model-${model.value}`}
                >
                  <Text
                    style={[styles.pickerOptionText, modelVersion === model.value && styles.pickerOptionTextSelected]}
                  >
                    {model.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.formField}>
          <Text style={styles.formLabel}>Default Duration (seconds)</Text>
          <TextInput
            style={styles.textInput}
            value={duration}
            onChangeText={setDuration}
            keyboardType="numeric"
            placeholder="180"
            placeholderTextColor={colors.text.tertiary}
            data-testid="input-duration"
          />
        </View>

        <View style={styles.formFieldRow}>
          <View style={styles.toggleField}>
            <Text style={styles.formLabel}>{t('admin.providers.instrumentalMode')}</Text>
            <Switch
              value={makeInstrumental}
              onValueChange={setMakeInstrumental}
              trackColor={{ false: colors.text.gray[600], true: colors.brand.primary }}
              data-testid="switch-instrumental"
            />
          </View>
          <View style={styles.toggleField}>
            <Text style={styles.formLabel}>{t('admin.providers.customMode')}</Text>
            <Switch
              value={customMode}
              onValueChange={setCustomMode}
              trackColor={{ false: colors.text.gray[600], true: colors.brand.primary }}
              data-testid="switch-custom-mode"
            />
          </View>
        </View>
      </View>
    </ProviderEditModalShell>
  );
}
