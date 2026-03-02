import { useState, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from '../../i18n';
import { useThemeColors, type ColorScheme } from '../../theme';
import { TabBar } from '../../components/shared/TabBar';
import { InviteFriends } from './InviteFriendsScreen';
import { FollowingScreen } from './FollowingScreen';

type ShareTab = 'invite' | 'following';

export function ShareScreen() {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [activeTab, setActiveTab] = useState<ShareTab>('invite');

  return (
    <View style={styles.container}>
      <View style={styles.tabBarWrapper}>
        <TabBar
          tabs={[
            {
              id: 'invite',
              label: t('sharing.inviteFriends', { defaultValue: 'Invite Friends' }),
            },
            { id: 'following', label: t('settingsPage.following') },
          ]}
          activeTab={activeTab}
          onTabChange={id => setActiveTab(id as ShareTab)}
          testIDPrefix="share-tab"
        />
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
    tabBarWrapper: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
  });

export default ShareScreen;
