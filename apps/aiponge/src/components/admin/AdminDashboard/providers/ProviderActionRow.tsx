import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { createProviderStyles } from './styles';

interface ProviderActionRowProps {
  providerId: string;
  providerType: string;
  isPrimary: boolean;
  testIsPending: boolean;
  setPrimaryIsPending: boolean;
  onTest: () => void;
  onEdit: () => void;
  onSetPrimary: () => void;
  testIdPrefix?: string;
}

export function ProviderActionRow({
  isPrimary,
  testIsPending,
  setPrimaryIsPending,
  onTest,
  onEdit,
  onSetPrimary,
  testIdPrefix = '',
}: ProviderActionRowProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProviderStyles(colors), [colors]);

  return (
    <View style={styles.actionRow}>
      <TouchableOpacity
        style={styles.testButton}
        onPress={onTest}
        disabled={testIsPending}
        data-testid={`button-test-${testIdPrefix}provider`}
      >
        {testIsPending ? (
          <ActivityIndicator size="small" color={colors.text.primary} />
        ) : (
          <>
            <Ionicons name="flask-outline" size={16} color={colors.text.primary} />
            <Text style={styles.testButtonText}>{t('admin.providers.test')}</Text>
          </>
        )}
      </TouchableOpacity>
      <TouchableOpacity style={styles.editButton} onPress={onEdit} data-testid={`button-edit-${testIdPrefix}provider`}>
        <Ionicons name="settings-outline" size={16} color={colors.text.primary} />
        <Text style={styles.editButtonText}>{t('admin.providers.configure')}</Text>
      </TouchableOpacity>
      {!isPrimary && (
        <TouchableOpacity
          style={styles.setPrimaryButton}
          onPress={onSetPrimary}
          disabled={setPrimaryIsPending}
          data-testid={`button-set-primary-${testIdPrefix}provider`}
        >
          {setPrimaryIsPending ? (
            <ActivityIndicator size="small" color={colors.brand.primary} />
          ) : (
            <>
              <Ionicons name="arrow-up-circle-outline" size={16} color={colors.brand.primary} />
              <Text style={styles.setPrimaryButtonText}>Set as Primary</Text>
            </>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}
