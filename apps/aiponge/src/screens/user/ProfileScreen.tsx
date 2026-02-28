/**
 * ProfileScreen - Personal Info and Privacy Management
 *
 * Tabs:
 * - Personal Info (basics)
 * - Privacy & Data (privacy)
 *
 * Accessible from Account menu when user clicks their avatar
 */

import React, { useState, useCallback, useMemo } from 'react';
import { View, ScrollView, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from '../../i18n';
import { ProfileBasicsTab, PrivacyDataTab, SongPreferencesTab } from '../../components/profile/ProfileTabs';
import { TabBar, type TabConfig } from '../../components/shared/TabBar';
import { commonStyles, useThemeColors } from '../../theme';
import { LoadingState } from '../../components/shared';
import { createProfileEditorStyles } from '../../styles/profileEditor.styles';
import { useProfileScreenState } from '../../hooks/profile/useProfileScreenState';

export const ProfileScreen: React.FC = () => {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createProfileEditorStyles(colors), [colors]);
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();

  const {
    userId,
    profileData,
    profileForm,
    setProfileForm,
    isLoading,
    refreshing,
    onRefresh,
    currentAvatarUrl,
    currentBirthdate,
    currentEmail,
    isSavingAvatar,
    isSavingBirthdate,
    handleNameSave,
    handleAvatarChange,
    handleBirthdateChange,
  } = useProfileScreenState();

  const getInitialTab = () => {
    if (params.tab === 'privacy') return 'privacy';
    if (params.tab === 'preferences') return 'preferences';
    return 'basics';
  };
  const [activeTab, setActiveTab] = useState(getInitialTab);

  const PROFILE_TABS: TabConfig[] = useMemo(
    () => [
      { id: 'basics', label: t('profile.personalInfo'), icon: 'person-outline' },
      { id: 'preferences', label: t('profile.songPreferences'), icon: 'musical-notes-outline' },
      { id: 'privacy', label: t('profile.privacyData'), icon: 'shield-outline' },
    ],
    [t]
  );

  const handleTabChange = useCallback((tab: string) => {
    const validTabs = ['basics', 'preferences', 'privacy'];
    setActiveTab(validTabs.includes(tab) ? tab : 'basics');
  }, []);

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled={true}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand.primary}
            colors={[colors.brand.primary]}
            progressBackgroundColor={colors.background.darkCard}
          />
        }
      >
        <View style={styles.tabContainer}>
          <TabBar tabs={PROFILE_TABS} activeTab={activeTab} onTabChange={handleTabChange} testIDPrefix="profile-tab" />

          {activeTab === 'basics' && profileData && (
            <ProfileBasicsTab
              profileData={profileData}
              profileForm={profileForm}
              setProfileForm={setProfileForm}
              onNameSave={handleNameSave}
              avatarUrl={currentAvatarUrl}
              birthdate={currentBirthdate}
              email={currentEmail}
              onAvatarChange={handleAvatarChange}
              onBirthdateChange={handleBirthdateChange}
              isSavingAvatar={isSavingAvatar}
              isSavingBirthdate={isSavingBirthdate}
              onSaveComplete={() => router.back()}
            />
          )}

          {activeTab === 'preferences' && <SongPreferencesTab />}

          {activeTab === 'privacy' && userId && <PrivacyDataTab userId={userId} />}
        </View>
      </ScrollView>
    </View>
  );
};
