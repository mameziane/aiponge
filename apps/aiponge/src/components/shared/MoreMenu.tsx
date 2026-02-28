import { useState } from 'react';
import { Linking, Platform } from 'react-native';
import { useTranslation } from '../../i18n';
import { useMenuActions } from '../../hooks/ui/useMenuActions';
import { MenuItem, MenuModal, MenuTrigger } from './MenuComponents';
import { logger } from '../../lib/logger';

const APPLE_APP_STORE_ID = '6450000000';
const ANDROID_PACKAGE_NAME = 'com.mameziane.aiponge';

interface MoreMenuProps {
  onClose?: () => void;
}

export function MoreMenu({ onClose }: MoreMenuProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  const handleClose = () => {
    setVisible(false);
    onClose?.();
  };

  const { handleNavigate, handleOnboardingReset } = useMenuActions({ onClose: handleClose });

  const handleRateUs = async () => {
    handleClose();
    const storeUrl = Platform.select({
      ios: `itms-apps://apps.apple.com/app/id${APPLE_APP_STORE_ID}?action=write-review`,
      android: `market://details?id=${ANDROID_PACKAGE_NAME}`,
      default: `https://apps.apple.com/app/id${APPLE_APP_STORE_ID}`,
    });

    try {
      const canOpen = await Linking.canOpenURL(storeUrl);
      if (canOpen) {
        await Linking.openURL(storeUrl);
      } else {
        const webUrl = Platform.select({
          ios: `https://apps.apple.com/app/id${APPLE_APP_STORE_ID}`,
          android: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_NAME}`,
          default: `https://apps.apple.com/app/id${APPLE_APP_STORE_ID}`,
        });
        await Linking.openURL(webUrl);
      }
    } catch (error) {
      logger.warn('Failed to open store URL:', { error });
    }
  };

  return (
    <>
      <MenuTrigger
        icon="ellipsis-horizontal"
        onPress={() => setVisible(true)}
        testID="header-more-button"
        label={t('components.moreMenu.more')}
        hint={t('components.moreMenu.opensMoreMenu')}
      />

      <MenuModal
        visible={visible}
        onClose={handleClose}
        closeLabel={t('components.accountMenu.closeMenu')}
        position="right"
        minWidth={220}
        maxHeight={400}
        scrollable
      >
        <MenuItem
          icon="options-outline"
          label={t('settingsPage.preferences')}
          onPress={() => handleNavigate('/preferences')}
          testID="menu-preferences"
        />
        <MenuItem
          icon="language-outline"
          label={t('settingsPage.language')}
          onPress={() => handleNavigate('/language')}
          testID="menu-language"
        />
        <MenuItem
          icon="notifications-outline"
          label={t('settingsPage.reminders')}
          onPress={() => handleNavigate('/(settings)/reminders')}
          testID="menu-reminders"
        />
        <MenuItem
          icon="shield-checkmark-outline"
          label={t('settingsPage.consent')}
          onPress={() => handleNavigate('/consent')}
          testID="menu-consent"
        />
        <MenuItem
          icon="warning-outline"
          label={t('settingsPage.explicitContent')}
          onPress={() => handleNavigate('/explicit-content')}
          testID="menu-explicit-content"
        />

        <MenuItem
          icon="book-outline"
          label={t('components.moreMenu.manifesto')}
          onPress={() => handleNavigate('/manifesto')}
          testID="menu-manifesto"
        />
        <MenuItem
          icon="sparkles-outline"
          label={t('settingsPage.ethicsValues')}
          onPress={() => handleNavigate('/ethics')}
          testID="menu-ethics"
        />
        <MenuItem
          icon="help-circle-outline"
          label={t('settingsPage.help')}
          onPress={() => handleNavigate('/help')}
          testID="menu-help"
        />

        <MenuItem
          icon="star-outline"
          label={t('components.moreMenu.rateUs')}
          onPress={handleRateUs}
          testID="menu-rate-us"
        />
        <MenuItem
          icon="refresh-outline"
          label={t('components.accountMenu.onboarding')}
          onPress={handleOnboardingReset}
          testID="menu-onboarding"
          showDivider={false}
        />
      </MenuModal>
    </>
  );
}
