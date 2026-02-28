import { useMemo, type ReactNode } from 'react';
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors, BORDER_RADIUS, colors as staticColors, type ColorScheme } from '../../theme';
import type { IconName } from '../../types/ui.types';

interface MenuItemProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  testID: string;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  variant?: 'default' | 'danger' | 'primary';
  showDivider?: boolean;
}

export function MenuItem({
  icon,
  label,
  onPress,
  testID,
  disabled = false,
  loading = false,
  loadingLabel,
  variant = 'default',
  showDivider = true,
}: MenuItemProps) {
  const colors = useThemeColors();
  const menuStyles = useMemo(() => createMenuStyles(colors), [colors]);
  const isDisabled = disabled || loading;
  const displayLabel = loading && loadingLabel ? loadingLabel : label;

  const iconColor = isDisabled
    ? colors.text.tertiary
    : variant === 'danger'
      ? colors.semantic.error
      : variant === 'primary'
        ? colors.brand.primary
        : colors.text.dark;

  const textColor = isDisabled
    ? colors.text.tertiary
    : variant === 'danger'
      ? colors.semantic.error
      : variant === 'primary'
        ? colors.brand.primary
        : colors.text.dark;

  return (
    <>
      <TouchableOpacity
        style={[menuStyles.menuItem, isDisabled && menuStyles.menuItemDisabled]}
        onPress={onPress}
        disabled={isDisabled}
        testID={testID}
        accessibilityRole="menuitem"
        accessibilityLabel={displayLabel}
        accessibilityState={{ disabled: isDisabled }}
      >
        <Ionicons name={icon} size={20} color={iconColor} />
        <Text style={[menuStyles.menuItemText, { color: textColor }]}>{displayLabel}</Text>
      </TouchableOpacity>
      {showDivider && <View style={menuStyles.menuDivider} />}
    </>
  );
}

interface MenuModalProps {
  visible: boolean;
  onClose: () => void;
  closeLabel: string;
  position?: 'left' | 'right';
  minWidth?: number;
  maxHeight?: number;
  scrollable?: boolean;
  children: ReactNode;
}

export function MenuModal({
  visible,
  onClose,
  closeLabel,
  position = 'right',
  minWidth = 180,
  maxHeight,
  scrollable = false,
  children,
}: MenuModalProps) {
  const colors = useThemeColors();
  const menuStyles = useMemo(() => createMenuStyles(colors), [colors]);
  const containerStyle = [
    menuStyles.menuContainer,
    { minWidth },
    maxHeight ? { maxHeight } : undefined,
    position === 'left' ? menuStyles.menuContainerLeft : menuStyles.menuContainerRight,
  ];

  const content = scrollable ? (
    <ScrollView style={menuStyles.menuScroll} bounces={false}>
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[menuStyles.overlay, position === 'left' ? menuStyles.overlayLeft : menuStyles.overlayRight]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
      >
        <View style={containerStyle}>{content}</View>
      </Pressable>
    </Modal>
  );
}

interface MenuTriggerProps {
  icon: IconName;
  onPress: () => void;
  testID: string;
  label: string;
  hint?: string;
  size?: number;
  style?: object;
}

export function MenuTrigger({ icon, onPress, testID, label, hint, size = 24, style }: MenuTriggerProps) {
  const colors = useThemeColors();
  const menuStyles = useMemo(() => createMenuStyles(colors), [colors]);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[menuStyles.triggerButton, style]}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Ionicons name={icon} size={size} color={colors.text.primary} />
    </TouchableOpacity>
  );
}

export const createMenuStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    triggerButton: {
      marginRight: 16,
    },
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay.medium,
      justifyContent: 'flex-start',
    },
    overlayLeft: {
      alignItems: 'flex-start',
    },
    overlayRight: {
      alignItems: 'flex-end',
    },
    menuContainer: {
      marginTop: 60,
      backgroundColor: colors.background.surface,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border.light,
      shadowColor: colors.background.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 8,
    },
    menuContainerLeft: {
      marginLeft: 12,
    },
    menuContainerRight: {
      marginRight: 12,
    },
    menuScroll: {
      flexGrow: 0,
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 12,
    },
    menuItemText: {
      fontSize: 16,
      color: colors.text.dark,
      fontWeight: '500',
    },
    menuItemDisabled: {
      opacity: 0.5,
    },
    menuDivider: {
      height: 1,
      backgroundColor: colors.border.light,
      marginHorizontal: 12,
    },
  });

export const menuStyles = createMenuStyles(staticColors);

export default { MenuItem, MenuModal, MenuTrigger, createMenuStyles };
