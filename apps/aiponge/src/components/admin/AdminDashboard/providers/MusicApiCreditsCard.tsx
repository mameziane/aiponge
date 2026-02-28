import { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '@/theme';
import { useRefreshMusicApiCredits } from '@/hooks/admin';
import { createSharedStyles } from '../shared';
import { createProviderStyles } from './styles';
import { formatRelativeTime } from './utils';

interface MusicApiCreditsCardProps {
  credits: {
    credits: number;
    extraCredits: number;
    totalCredits: number;
    lastSyncedAt?: string;
    nextSyncAt?: string;
    cached?: boolean;
  };
}

export function MusicApiCreditsCard({ credits }: MusicApiCreditsCardProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProviderStyles(colors), [colors]);
  const sharedStyles = useMemo(() => createSharedStyles(colors), [colors]);
  const refreshMutation = useRefreshMusicApiCredits();

  return (
    <View style={sharedStyles.musicApiCreditsCard} data-testid="card-musicapi-credits">
      <View style={sharedStyles.musicApiCreditsHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <Ionicons name="musical-notes" size={18} color={colors.brand.primary} />
          <Text style={sharedStyles.musicApiCreditsTitle}>{t('admin.providers.musicApiCredits')}</Text>
        </View>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          data-testid="button-refresh-credits"
        >
          {refreshMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.text.primary} />
          ) : (
            <Ionicons name="refresh" size={16} color={colors.text.primary} />
          )}
        </TouchableOpacity>
      </View>
      <View style={sharedStyles.musicApiCreditsRow}>
        <View style={sharedStyles.musicApiCreditItem}>
          <Text style={sharedStyles.musicApiCreditValue} data-testid="text-credits-base">
            {credits.credits}
          </Text>
          <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.providers.credits')}</Text>
        </View>
        <View style={sharedStyles.musicApiCreditItem}>
          <Text style={sharedStyles.musicApiCreditValue} data-testid="text-credits-extra">
            {credits.extraCredits}
          </Text>
          <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.providers.extra')}</Text>
        </View>
        <View style={sharedStyles.musicApiCreditItem}>
          <Text
            style={[sharedStyles.musicApiCreditValue, { color: colors.brand.primary }]}
            data-testid="text-credits-total"
          >
            {credits.totalCredits}
          </Text>
          <Text style={sharedStyles.musicApiCreditLabel}>{t('admin.providers.total')}</Text>
        </View>
      </View>
      {credits.lastSyncedAt && (
        <View style={styles.syncInfoRow} data-testid="section-sync-info">
          <Ionicons name="time-outline" size={12} color={colors.text.tertiary} />
          <Text style={styles.syncInfoText} data-testid="text-last-sync">
            Synced {formatRelativeTime(credits.lastSyncedAt)}
          </Text>
          {credits.cached && (
            <View style={styles.cachedBadge}>
              <Text style={styles.cachedBadgeText}>{t('admin.providers.cached')}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
