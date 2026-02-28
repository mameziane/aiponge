import { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme, BORDER_RADIUS } from '../../theme';
import { InviteFriends } from './InviteFriendsScreen';
import { FollowingScreen } from './FollowingScreen';

type ShareTab = 'invite' | 'following';

export function ShareScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<ShareTab>('invite');

  const tabs: { key: ShareTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { key: 'invite', label: t('sharing.inviteFriends', { defaultValue: 'Invite Friends' }), icon: 'gift-outline' },
    { key: 'following', label: t('settingsPage.following'), icon: 'people-outline' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            testID={`share-tab-${tab.key}`}
          >
            <Ionicons
              name={tab.icon}
              size={18}
              color={activeTab === tab.key ? colors.brand.primary : colors.text.tertiary}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {activeTab === 'invite' && <InviteFriends />}
      {activeTab === 'following' && <FollowingScreen />}
    </View>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
    },
    tabBar: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
      gap: 8,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.background.secondary,
      borderWidth: 1,
      borderColor: colors.border.muted,
    },
    tabActive: {
      backgroundColor: colors.background.surfaceLight,
      borderColor: colors.brand.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text.tertiary,
    },
    tabTextActive: {
      color: colors.brand.primary,
      fontWeight: '600',
    },
  });

export default ShareScreen;
