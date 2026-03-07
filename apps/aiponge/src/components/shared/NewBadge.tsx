/**
 * NewBadge — small "NEW" indicator overlaid on artwork for recently created items.
 * Shows for items created within the last 7 days.
 */

import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { useThemeColors } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';

const NEW_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function isNewItem(createdAt?: string | null): boolean {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return Date.now() - created < NEW_THRESHOLD_MS;
}

interface NewBadgeProps {
  createdAt?: string | null;
  /** Override position — defaults to top-left */
  position?: 'top-left' | 'top-right';
}

export function NewBadge({ createdAt, position = 'top-left' }: NewBadgeProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();

  if (!isNewItem(createdAt)) return null;

  return (
    <View
      style={[
        styles.badge,
        position === 'top-right' ? styles.topRight : styles.topLeft,
        { backgroundColor: colors.brand.primary },
      ]}
    >
      <Text style={styles.text}>{t('common.new', { defaultValue: 'NEW' })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    zIndex: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
  },
  topLeft: {
    top: 6,
    left: 6,
  },
  topRight: {
    top: 6,
    right: 6,
  },
  text: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
