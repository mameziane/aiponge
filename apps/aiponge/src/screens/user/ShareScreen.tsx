import { useState, useMemo, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { TabBar } from '../../components/shared/TabBar';
import { InviteFriends } from './InviteFriendsScreen';
import { MembersScreen } from './MembersScreen';
import { FollowingScreen } from './FollowingScreen';

type ShareTab = 'invite' | 'members' | 'following';

export function ShareScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<ShareTab>('invite');

  const navigateToMembers = useCallback(() => setActiveTab('members'), []);

  return (
    <View style={styles.container}>
      <View style={styles.tabBarWrapper}>
        <TabBar
          tabs={[
            {
              id: 'invite',
              label: t('sharing.inviteFriends', { defaultValue: 'Invite Friends' }),
            },
            {
              id: 'members',
              label: t('creatorMembers.members'),
            },
            { id: 'following', label: t('settingsPage.following') },
          ]}
          activeTab={activeTab}
          onTabChange={id => setActiveTab(id as ShareTab)}
          testIDPrefix="share-tab"
        />
      </View>
      {activeTab === 'invite' && <InviteFriends onNavigateToMembers={navigateToMembers} />}
      {activeTab === 'members' && <MembersScreen />}
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
    tabBarWrapper: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
  });

export default ShareScreen;
