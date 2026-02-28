import React, { ReactNode, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  StyleSheet,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColors, commonStyles, type ColorScheme } from '../../theme';
import { LiquidGlassView } from '../ui';

interface BaseModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  testID?: string;
  closeTestID?: string;
  animationType?: 'slide' | 'fade' | 'none';
  showHeader?: boolean;
  headerIcon?: keyof typeof Ionicons.glyphMap;
  headerIconColor?: string;
  maxHeight?: string | number;
  contentStyle?: ViewStyle;
  scrollable?: boolean;
  avoidKeyboard?: boolean;
  position?: 'top' | 'bottom';
  keyboardVerticalOffset?: number;
}

export function BaseModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
  testID,
  closeTestID = 'button-close-modal',
  animationType = 'slide',
  showHeader = true,
  headerIcon,
  headerIconColor,
  maxHeight = '70%',
  contentStyle,
  scrollable = true,
  avoidKeyboard = false,
  position = 'bottom',
  keyboardVerticalOffset,
}: BaseModalProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const resolvedIconColor = headerIconColor ?? colors.brand.primary;

  const isTopPosition = position === 'top';
  const calculatedOffset = keyboardVerticalOffset ?? (isTopPosition ? insets.top : 0);

  const needsKeyboardWrapper = avoidKeyboard;

  const overlayStyle = [styles.modalOverlay, isTopPosition && styles.modalOverlayTop];

  const contentStyles = useMemo(
    () =>
      StyleSheet.flatten(
        [
          styles.modalContent,
          isTopPosition ? styles.modalContentTop : { maxHeight },
          isTopPosition && { marginTop: insets.top },
          contentStyle,
        ].filter(Boolean)
      ) as ViewStyle,
    [isTopPosition, maxHeight, insets.top, contentStyle, styles]
  );

  const content = (
    <View style={overlayStyle}>
      {!isTopPosition && (
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlayTouchable} />
        </TouchableWithoutFeedback>
      )}
      <LiquidGlassView intensity="strong" borderRadius={0} showBorder={false} style={contentStyles}>
        {showHeader && (
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleContainer}>
              {headerIcon && (
                <Ionicons name={headerIcon} size={24} color={resolvedIconColor} style={styles.headerIcon} />
              )}
              <View style={styles.titleTextContainer}>
                <Text style={styles.modalTitle}>{title}</Text>
                {subtitle && (
                  <Text style={styles.modalSubtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                )}
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} testID={closeTestID} activeOpacity={0.7}>
              <Ionicons name="close" size={24} color={colors.text.primary} />
            </TouchableOpacity>
          </View>
        )}

        {scrollable ? (
          avoidKeyboard ? (
            <KeyboardAwareScrollView
              style={isTopPosition ? styles.scrollContentTop : styles.scrollContent}
              contentContainerStyle={[styles.scrollContentContainer, isTopPosition && { paddingBottom: 40 }]}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
              bottomOffset={20}
            >
              {children}
            </KeyboardAwareScrollView>
          ) : (
            <ScrollView
              style={isTopPosition ? styles.scrollContentTop : styles.scrollContent}
              contentContainerStyle={[styles.scrollContentContainer, isTopPosition && { paddingBottom: 40 }]}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          )
        ) : (
          <View style={styles.nonScrollContent}>{children}</View>
        )}
      </LiquidGlassView>
      {isTopPosition && (
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlayTouchable} />
        </TouchableWithoutFeedback>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType={animationType} transparent={true} onRequestClose={onClose} testID={testID}>
      {needsKeyboardWrapper ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoidingView}
          keyboardVerticalOffset={calculatedOffset}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </Modal>
  );
}

const createStyles = (colors: ColorScheme) =>
  StyleSheet.create({
    keyboardAvoidingView: commonStyles.flexOne,
    modalOverlay: {
      flex: 1,
      backgroundColor: colors.overlay.dark,
      justifyContent: 'flex-end',
    },
    modalOverlayTop: {
      justifyContent: 'flex-start',
    },
    overlayTouchable: commonStyles.flexOne,
    modalContent: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      overflow: 'hidden',
    },
    modalContentTop: {
      borderTopLeftRadius: 0,
      borderTopRightRadius: 0,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border.muted,
    },
    modalTitleContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 16,
    },
    headerIcon: {
      marginRight: 12,
    },
    titleTextContainer: {
      flex: 1,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text.primary,
    },
    modalSubtitle: {
      fontSize: 14,
      color: colors.text.secondary,
      marginTop: 4,
    },
    closeButton: {
      padding: 4,
    },
    scrollContent: commonStyles.flexOne,
    scrollContentTop: {
      flexGrow: 0,
      flexShrink: 1,
    },
    scrollContentContainer: {
      padding: 20,
    },
    nonScrollContent: {
      padding: 20,
    },
  });

export default BaseModal;
