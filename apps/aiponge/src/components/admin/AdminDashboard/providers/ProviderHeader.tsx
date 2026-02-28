import { useMemo } from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/theme';
import { StatusBadge } from '../shared';
import { createProviderStyles } from './styles';
import type { ProviderConfiguration } from '@/hooks/admin';

interface ProviderHeaderProps {
  provider: ProviderConfiguration;
  icon: keyof typeof Ionicons.glyphMap;
  testIdPrefix?: string;
}

export function ProviderHeader({ provider, icon, testIdPrefix = '' }: ProviderHeaderProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createProviderStyles(colors), [colors]);

  return (
    <View style={styles.providerHeader}>
      <View style={styles.providerTitleRow}>
        <Ionicons name={icon} size={20} color={colors.brand.primary} />
        <Text style={styles.providerName} data-testid={`text-${testIdPrefix}provider-name`}>
          {provider.providerName}
        </Text>
        {provider.isPrimary ? (
          <View style={styles.primaryBadge}>
            <Text style={styles.primaryBadgeText} data-testid={`text-${testIdPrefix}provider-primary`}>
              PRIMARY
            </Text>
          </View>
        ) : (
          <View style={styles.fallbackBadge}>
            <Text style={styles.fallbackBadgeText} data-testid={`text-${testIdPrefix}provider-fallback`}>
              FALLBACK
            </Text>
          </View>
        )}
      </View>
      <StatusBadge
        status={
          provider.isActive
            ? provider.healthStatus === 'unknown' || !provider.healthStatus
              ? 'healthy'
              : provider.healthStatus
            : 'unhealthy'
        }
        label={
          provider.isActive
            ? provider.healthStatus === 'unknown' || !provider.healthStatus
              ? 'ACTIVE'
              : provider.healthStatus.toUpperCase()
            : 'DISABLED'
        }
      />
    </View>
  );
}
