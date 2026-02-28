import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, type ColorScheme } from '../../theme';
import { BORDER_RADIUS } from '../../theme/constants';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MENU_WIDTH = 180;
const MENU_HEIGHT = 160;

interface SelectionMenuProps {
  visible: boolean;
  selectedText: string;
  position: { x: number; y: number };
  onCopy: () => void;
  onCreateEntry: () => void;
  onCreateSong: () => void;
  onClose: () => void;
}

export function SelectionMenu({
  visible,
  selectedText,
  position,
  onCopy,
  onCreateEntry,
  onCreateSong,
  onClose,
}: SelectionMenuProps) {
  const { t } = useTranslation();
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);

  if (!visible || !selectedText) return null;

  const menuTop = Math.max(80, Math.min(position.y - 60, SCREEN_HEIGHT - MENU_HEIGHT - 100));
  const menuLeft = Math.max(20, Math.min(position.x - MENU_WIDTH / 2, SCREEN_WIDTH - MENU_WIDTH - 20));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose}>
        <View
          style={[
            styles.menu,
            {
              top: menuTop,
              left: menuLeft,
            },
          ]}
        >
          <TouchableOpacity style={styles.menuItem} onPress={onCopy} activeOpacity={0.7}>
            <Ionicons name="copy-outline" size={20} color={colors.text.primary} />
            <Text style={styles.menuText}>{t('reader.copy')}</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity style={styles.menuItem} onPress={onCreateEntry} activeOpacity={0.7}>
            <Ionicons name="bulb-outline" size={20} color={colors.brand.primary} />
            <Text style={styles.menuText}>{t('reader.saveAsEntry')}</Text>
          </TouchableOpacity>

          <View style={styles.separator} />

          <TouchableOpacity style={styles.menuItem} onPress={onCreateSong} activeOpacity={0.7}>
            <Ionicons name="musical-notes-outline" size={20} color={colors.brand.pink} />
            <Text style={styles.menuText}>{t('reader.createSong')}</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.overlay.black[25],
    },
    menu: {
      position: 'absolute',
      backgroundColor: colors.background.darkCard,
      borderRadius: BORDER_RADIUS.md,
      paddingVertical: 8,
      paddingHorizontal: 4,
      minWidth: 180,
      shadowColor: colors.absolute.black,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
      borderWidth: 1,
      borderColor: colors.border.primary,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
      gap: 12,
    },
    menuText: {
      fontSize: 15,
      color: colors.text.primary,
      fontWeight: '500',
    },
    separator: {
      height: 1,
      backgroundColor: colors.border.primary,
      marginHorizontal: 12,
    },
  });
